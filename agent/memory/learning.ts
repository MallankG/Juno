import { defineMemory } from "eve/memory";

import { learningMemory } from "../lib/learning-memory";
import { assistantScope } from "../lib/scope";

/**
 * Local learning log: exchanges (for the nightly review), feedback on
 * suggestions, and saved morning briefs. Facts about the user live in the
 * `supermemory` slot.
 */
export default defineMemory({
  description:
    "Feedback on suggestions, the daily brief history, and a log of recent exchanges used for the nightly review.",
  provider: learningMemory(),
  scope: assistantScope,
});
