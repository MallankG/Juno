import { defineAgent } from "eve";

import { model } from "./lib/model";

export default defineAgent({
  model,
  // Set explicitly so the build does not need the AI Gateway model catalog.
  // gpt-oss-20b has a 131k context window on Groq.
  modelContextWindowTokens: 131_072,
  reasoning: "low",
  compaction: { threshold: 0.8 },
  experimental: {
    workflow: {
      // Keep each conversation's history readable, so the phone app can show
      // earlier turns. The default deletes a private session's history when
      // its run ends. See README "Privacy" for what this keeps.
      retention: "default",
    },
  },
});
