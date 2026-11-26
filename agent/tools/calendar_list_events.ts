import { defineTool } from "eve/tools";
import { z } from "zod";

import { googleFetch } from "../lib/google";

type GoogleEvent = {
  id: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email: string; responseStatus?: string }[];
  htmlLink?: string;
};

export default defineTool({
  description:
    "List Google Calendar events in a time range (primary calendar). Use it to see what is already scheduled before proposing anything.",
  label: { start: ({ from, to }) => `Check calendar ${from.slice(0, 10)} to ${to.slice(0, 10)}` },
  inputSchema: z.object({
    from: z.string().describe("ISO 8601 start, e.g. 2026-11-27T00:00:00-05:00"),
    to: z.string().describe("ISO 8601 end"),
    limit: z.number().int().min(1).max(50).default(25),
  }),
  async execute({ from, to, limit }) {
    const params = new URLSearchParams({
      timeMin: from,
      timeMax: to,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(limit),
    });
    const data = await googleFetch<{ items?: GoogleEvent[] }>(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    );
    return {
      events: (data.items ?? []).map((e) => ({
        id: e.id,
        title: e.summary ?? "(no title)",
        start: e.start?.dateTime ?? e.start?.date,
        end: e.end?.dateTime ?? e.end?.date,
        location: e.location,
        attendees: e.attendees?.map((a) => a.email),
        link: e.htmlLink,
      })),
    };
  },
});
