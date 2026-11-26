import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

import { googleFetch } from "../lib/google";
import { whoIsCalling } from "../lib/who";

/**
 * Creates an event on the user's primary calendar.
 *
 * `approval: always()` pauses the turn and asks the user every time. Nothing is
 * written to Google Calendar without that confirmation.
 */
export default defineTool({
  description:
    "Create a Google Calendar event on the user's primary calendar. Only call this after the user has agreed to that specific event. Each call asks the user to approve it first.",
  label: { start: ({ title, start }) => `Add "${title}" at ${start}` },
  approval: always(),
  inputSchema: z.object({
    title: z.string().min(1).max(200),
    start: z.string().describe("Local start time, e.g. 2026-12-01T09:00:00"),
    end: z.string().describe("Local end time, e.g. 2026-12-01T09:30:00"),
    timeZone: z.string().describe("IANA time zone, e.g. America/New_York"),
    description: z.string().max(2000).optional(),
    location: z.string().max(300).optional(),
  }),
  async execute({ title, start, end, timeZone, description, location }, ctx) {
    const event = await googleFetch<{ id: string; htmlLink?: string }>(
      whoIsCalling(ctx),
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        body: JSON.stringify({
          summary: title,
          description: description ? `${description}\n\n(Added by your assistant after your approval.)` : undefined,
          location,
          start: { dateTime: start, timeZone },
          end: { dateTime: end, timeZone },
        }),
      },
    );
    return { created: true, id: event.id, link: event.htmlLink };
  },
});
