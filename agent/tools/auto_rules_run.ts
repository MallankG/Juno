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
    "Add the events from the user's automatic rules for the next 7 days, skipping any already on the calendar. Used by the daily job; only uses rules the user approved.",
  label: { start: () => "Add automatic calendar events" },
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const who = whoIsCalling(ctx);
    const user = await findUser(who);
    const rules = user?.autoRules ?? [];
    if (rules.length === 0) return { added: [], note: "No automatic rules." };
    const zone = user?.timezone ?? "America/New_York";

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const added: string[] = [];
    for (let offset = 0; offset < 7 && added.length < 20; offset++) {
      const day = new Date(`${today}T12:00:00Z`);
      day.setUTCDate(day.getUTCDate() + offset);
      const date = day.toISOString().slice(0, 10);
      const weekday = day.getUTCDay();

      for (const rule of rules.filter((r) => r.weekday === weekday)) {
        const start = `${date}T${rule.startTime}:00`;
        const endDate = new Date(`${start}Z`);
        endDate.setUTCMinutes(endDate.getUTCMinutes() + rule.durationMinutes);
        const end = endDate.toISOString().slice(0, 19);

        const dayStart = new Date(`${date}T00:00:00Z`);
        dayStart.setUTCDate(dayStart.getUTCDate() - 1);
        const dayEnd = new Date(`${date}T23:59:59Z`);
        dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
        const existing = await googleFetch<{ items?: { summary?: string; start?: { dateTime?: string } }[] }>(
          who,
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
            timeMin: dayStart.toISOString(), timeMax: dayEnd.toISOString(), singleEvents: "true", q: rule.title,
          })}`,
        );
        const already = (existing.items ?? []).some(
          (e) => e.summary === rule.title && e.start?.dateTime?.startsWith(`${date}T${rule.startTime}`),
        );
        if (already) continue;

        await googleFetch(who, "https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          body: JSON.stringify({
            summary: rule.title,
            description: "Added automatically from your calendar rule.",
            start: { dateTime: start, timeZone: zone },
            end: { dateTime: end, timeZone: zone },
          }),
        });
        added.push(`${date} ${rule.startTime} ${rule.title}`);
      }
    }
    return { added };
  },
});
