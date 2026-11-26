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
  description: "List the user's automatic calendar rules, with ids.",
  label: false,
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const user = await findUser(whoIsCalling(ctx));
    return { rules: user?.autoRules ?? [] };
  },
});
