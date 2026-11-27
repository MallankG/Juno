import supermemory from "@supermemory/eve";
import { defineMemory } from "eve/memory";

import { assistantScope } from "../lib/scope";

/**
 * Long-term memory of facts about the user (people, projects, preferences,
 * routines, goals). Supermemory extracts facts from each finished turn,
 * recalls the relevant ones before the next turn, and provides tools to
 * search, remember and forget. Free tier: $5 of credits a month.
 */
// Supermemory offers seven tools. Each tool's description is sent to the model
// on every request, and Groq's free tier allows only 8,000 tokens a minute, so
// Juno keeps the three it needs. Recall before each turn and capture after it
// still happen automatically.
const KEEP = new Set(["search", "remember", "forget"]);

function lean(provider: ReturnType<typeof supermemory>): ReturnType<typeof supermemory> {
  const tools = provider.tools?.bind(provider);
  if (!tools) return provider;
  return {
    ...provider,
    async tools(context) {
      const all = await tools(context);
      return Object.fromEntries(Object.entries(all ?? {}).filter(([name]) => KEEP.has(name)));
    },
  } as ReturnType<typeof supermemory>;
}

export default defineMemory({
  description:
    "Durable facts about the user: people they work with, projects, preferences, routines and goals. Save only lasting facts; never secrets.",
  provider: lean(
    supermemory({
      apiKey: process.env.SUPERMEMORY_API_KEY!,
    }),
  ),
  scope: assistantScope,
});
