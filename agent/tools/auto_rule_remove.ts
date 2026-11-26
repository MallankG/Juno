import { defineTool } from "eve/tools";
import { always, never } from "eve/tools/approval";
import { z } from "zod";

import { findUser, updateUser, type AutoRule } from "../lib/accounts";
import { googleFetch } from "../lib/google";
import { newId } from "../lib/store";
import { whoIsCalling } from "../lib/who";

/**
 * Automatic calendar rules. Creating a rule needs the user's approval. Once
 * approved, the rule adds that event every week without asking again, and the
 * user can remove it at any time.
 */


export default defineTool({
  description: "Remove an automatic calendar rule by id, when the user asks to stop it.",
  label: { start: () => "Remove calendar rule" },
  approval: never(),
  inputSchema: z.object({ id: z.string() }),
  async execute({ id }, ctx) {
    let removed = false;
    await updateUser(whoIsCalling(ctx), (user) => {
      const before = user.autoRules.length;
      user.autoRules = user.autoRules.filter((r) => r.id !== id);
      removed = user.autoRules.length < before;
    });
    return { removed };
  },
});

/** Adds this week's events from the user's rules (run by the daily job). */
