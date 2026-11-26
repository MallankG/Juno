import { defineMemoryProvider } from "eve/memory";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { type Brief, type Episode, newId, readScope, updateScope } from "./store";

/**
 * The local learning log. It does not inject anything into the model's
 * context (Supermemory does the recall), which keeps token costs down.
 *
 *  - capture: stores each finished exchange once, for the nightly review.
 *  - record_feedback: logs accepted, rejected or corrected suggestions.
 *  - save_brief / latest_brief: keeps the morning brief history.
 */

function textOf(message: unknown): string {
  const content = (message as { content?: unknown })?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && "text" in part ? String((part as { text: unknown }).text) : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

const roleOf = (message: unknown) => String((message as { role?: unknown })?.role ?? "");

export function learningMemory() {
  return defineMemoryProvider({
    recall: {
      "turn.started"() {
        return null; // nothing injected: Supermemory handles recall
      },
    },

    capture: {
      "turn.completed"(ctx) {
        const key = ctx.memory.scope.key;
        const user = ctx.turn.input.filter((m) => roleOf(m) === "user").map(textOf).join("\n").trim();
        const last = [...ctx.messages].reverse().find((m) => roleOf(m) === "assistant");
        const assistant = last ? textOf(last).trim() : "";
        if (!user && !assistant) return;

        updateScope(key, (s) => {
          // Operations can be retried, so store each one at most once.
          if (s.seenOperations.includes(ctx.operationId)) return;
          s.seenOperations.push(ctx.operationId);
          s.episodes.push({
            id: ctx.operationId,
            at: new Date().toISOString(),
            kind: "exchange",
            user: user.slice(0, 2000),
            assistant: assistant.slice(0, 2000),
          });
        });
      },
    },

    async tools(ctx) {
      const key = ctx.memory.scope.key;
      return {
        record_feedback: defineTool({
          description:
            "Log how the user reacted to a suggestion: accepted, rejected, or corrected. The nightly review uses this to update what is remembered.",
          inputSchema: z.object({
            outcome: z.enum(["accepted", "rejected", "corrected"]),
            subject: z.string().min(3).max(300).describe("What was suggested, e.g. 'standup on Fridays at 9'"),
            correction: z.string().max(500).optional().describe("What the user said instead, if anything"),
          }),
          async execute({ outcome, subject, correction }) {
            const episode: Episode = {
              id: newId("fb"),
              at: new Date().toISOString(),
              kind: "feedback",
              outcome,
              subject,
              correction,
            };
            updateScope(key, (s) => {
              s.episodes.push(episode);
            });
            return { recorded: true, id: episode.id };
          },
        }),

        recent_episodes: defineTool({
          description:
            "Read exchanges and feedback from the last N days. Used by the nightly review.",
          inputSchema: z.object({ days: z.number().int().min(1).max(30).default(1) }),
          async execute({ days }) {
            const since = Date.now() - days * 24 * 60 * 60 * 1000;
            return {
              episodes: readScope(key).episodes
                .filter((e) => Date.parse(e.at) >= since)
                .map(({ id: _id, ...rest }) => rest),
            };
          },
        }),

        save_brief: defineTool({
          description: "Store the morning brief you just wrote, so the user can ask for it later.",
          inputSchema: z.object({ text: z.string().min(20).max(20000) }),
          async execute({ text }) {
            const now = new Date();
            const brief: Brief = {
              id: newId("brief"),
              date: now.toISOString().slice(0, 10),
              text,
              createdAt: now.toISOString(),
            };
            updateScope(key, (s) => {
              s.briefs.push(brief);
            });
            return { saved: true, id: brief.id, date: brief.date };
          },
        }),

        latest_brief: defineTool({
          description: "Return the most recent saved morning brief.",
          inputSchema: z.object({}),
          async execute() {
            const briefs = readScope(key).briefs;
            const latest = briefs[briefs.length - 1];
            return latest ? { date: latest.date, text: latest.text } : { text: null, reason: "No brief yet." };
          },
        }),
      };
    },
  });
}
