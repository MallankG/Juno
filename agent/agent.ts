import { defineAgent } from "eve";

export default defineAgent({
  // Haiku is the cheapest current Claude model that handles tool use well.
  // Switch to "anthropic/claude-sonnet-5" for stronger reasoning.
  model: "anthropic/claude-haiku-5-5",
  // Set explicitly so the build does not need the AI Gateway catalog.
  modelContextWindowTokens: 200_000,
  reasoning: "low",
  compaction: { threshold: 0.8 },
});
