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
  description:
    "Save an automatic calendar rule, e.g. 'every Monday at 09:00, 30 minutes, Team standup'. The user must approve it. Once saved, the event is added to their calendar automatically each week.",
  label: { start: ({ title, weekday }) => `Add rule: ${title} on ${weekday}` },
  approval: always(),
  inputSchema: z.object({
    title: z.string().min(1).max(120),
    weekday: z.number().int().min(0).max(6).describe("0 = Sunday ... 6 = Saturday"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).describe("24-hour local time, e.g. 09:00"),
    durationMinutes: z.number().int().min(5).max(480),
  }),
  async execute(input, ctx) {
    const rule: AutoRule = { id: newId("rule"), ...input };
    await updateUser(whoIsCalling(ctx), (user) => {
      user.autoRules.push(rule);
    });
    return { saved: true, id: rule.id };
  },
});
