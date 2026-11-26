import supermemory from "@supermemory/eve";
import { defineMemory } from "eve/memory";

import { assistantScope } from "../lib/scope";

/**
 * Long-term memory of facts about the user (people, projects, preferences,
 * routines, goals). Supermemory extracts facts from each finished turn,
 * recalls the relevant ones before the next turn, and provides tools to
 * search, remember and forget. Free tier: $5 of credits a month.
 */
export default defineMemory({
  description:
    "Durable facts about the user: people they work with, projects, preferences, routines and goals. Save only lasting facts; never secrets.",
  provider: supermemory({
    apiKey: process.env.SUPERMEMORY_API_KEY!,
  }),
  scope: assistantScope,
});
