import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

import { googleFetch } from "../lib/google";

/**
 * Creates an event on the user's primary calendar.
 *
 * `approval: always()` means eve pauses the turn and asks the user to approve
 * every call. Nothing is written to Google Calendar without that confirmation.
 */
export default defineTool({
  description:
    "Create a Google Calendar event on the primary calendar. Only call this after the user has agreed to the specific event. Each call asks the user to approve it first.",
  label: { start: ({ title, start }) => `Add "${title}" at ${start}` },
  approval: always(),
  inputSchema: z.object({
    title: z.string().min(1).max(200),
    start: z.string().describe("ISO 8601 start with offset"),
    end: z.string().describe("ISO 8601 end with offset"),
    description: z.string().max(2000).optional(),
    location: z.string().max(300).optional(),
  }),
  async execute({ title, start, end, description, location }) {
    const event = await googleFetch<{ id: string; htmlLink?: string }>(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        body: JSON.stringify({
          summary: title,
          description: description ? `${description}\n\n(Added by your assistant after your approval.)` : undefined,
          location,
          start: { dateTime: start },
          end: { dateTime: end },
        }),
      },
    );
    return { created: true, id: event.id, link: event.htmlLink };
  },
});
