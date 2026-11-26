import { defineMemoryProvider } from "eve/memory";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { notify } from "./push";
import { type Brief, type Episode, newId, readScope, updateScope } from "./scope-data";
import { whoIsCalling } from "./who";

/**
 * The learning log for each person. It injects nothing into the model's context
 * (Supermemory does the recall), which keeps token costs down.
 *
 *  - capture: stores each finished exchange once, for the nightly review.
 *  - record_feedback: logs accepted, rejected or corrected suggestions.
 *  - save_brief / latest_brief: keeps briefs (daily, weekly, triage) and pushes
 *    a notification to the person's phone when a brief is saved.
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

const KIND_TITLES: Record<Brief["kind"], string> = {
  daily: "Your morning brief is ready",
  weekly: "Your weekly review is ready",
  triage: "Mail to review",
};

export function learningMemory() {
  return defineMemoryProvider({
    recall: {
      async "turn.started"() {
        return null;
      },
    },

    capture: {
      async "turn.completed"(ctx) {
        const key = ctx.memory.scope.key;
        const user = ctx.turn.input.filter((m) => roleOf(m) === "user").map(textOf).join("\n").trim();
        const last = [...ctx.messages].reverse().find((m) => roleOf(m) === "assistant");
        const assistant = last ? textOf(last).trim() : "";
        if (!user && !assistant) return;

        await updateScope(key, (s) => {
          if (s.seenOperations.includes(ctx.operationId)) return; // retries store once
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
            await updateScope(key, (s) => {
              s.episodes.push(episode);
            });
            return { recorded: true, id: episode.id };
          },
        }),

        recent_episodes: defineTool({
          description: "Read exchanges and feedback from the last N days. Used by the nightly review and the weekly review.",
          inputSchema: z.object({ days: z.number().int().min(1).max(30).default(1) }),
          async execute({ days }) {
            const since = Date.now() - days * 24 * 60 * 60 * 1000;
            const scope = await readScope(key);
            return {
              episodes: scope.episodes
                .filter((e) => Date.parse(e.at) >= since)
                .map(({ id: _id, ...rest }) => rest),
            };
          },
        }),

        save_brief: defineTool({
          description:
            "Store a brief you just wrote (kind: daily morning brief, weekly review, or triage notes). This also sends the person a notification.",
          inputSchema: z.object({
            kind: z.enum(["daily", "weekly", "triage"]).default("daily"),
            text: z.string().min(20).max(20000),
          }),
          async execute({ kind, text }, toolCtx) {
            const now = new Date();
            const brief: Brief = {
              id: newId("brief"),
              kind,
              date: now.toISOString().slice(0, 10),
              text,
              createdAt: now.toISOString(),
            };
            await updateScope(key, (s) => {
              s.briefs.push(brief);
            });
            let notified = 0;
            try {
              notified = await notify(whoIsCalling(toolCtx), {
                title: KIND_TITLES[kind],
                body: text.slice(0, 120),
                url: "/",
              });
            } catch {
              // A failed notification must not lose the brief.
            }
            return { saved: true, id: brief.id, date: brief.date, notified };
          },
        }),

        latest_brief: defineTool({
          description: "Return the most recent brief of a kind (daily, weekly or triage). Defaults to daily.",
          inputSchema: z.object({ kind: z.enum(["daily", "weekly", "triage"]).default("daily") }),
          async execute({ kind }) {
            const briefs = (await readScope(key)).briefs.filter((b) => b.kind === kind);
            const latest = briefs[briefs.length - 1];
            return latest ? { date: latest.date, text: latest.text } : { text: null, reason: `No ${kind} brief yet.` };
          },
        }),
      };
    },
  });
}
