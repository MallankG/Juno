import { defineMemory } from "eve/memory";

import { learningMemory } from "../lib/learning-memory";
import { assistantScope } from "../lib/scope";

/**
 * Each person's learning log: exchanges (for the nightly review), feedback on
 * suggestions, and their briefs. Facts about them live in the `supermemory` slot.
 */
export default defineMemory({
  description:
    "Feedback on suggestions, the brief history, and a log of recent exchanges used for the nightly review.",
  provider: learningMemory(),
  scope: assistantScope,
});
