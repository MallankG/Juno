import { defineTool } from "eve/tools";
import { z } from "zod";

import { googleFetch } from "../lib/google";
import { whoIsCalling } from "../lib/who";

type Header = { name: string; value: string };
type MessageMeta = { id: string; threadId?: string; payload?: { headers?: Header[] }; snippet?: string };

const header = (headers: Header[] | undefined, name: string) =>
  headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

export default defineTool({
  description:
    "Search the user's Gmail and return recent message metadata (sender, subject, date, snippet, thread id). Read-only: it never sends or changes mail. Use Gmail search syntax, e.g. 'is:unread newer_than:2d'.",
  label: { start: ({ query }) => `Search mail: ${query}` },
  inputSchema: z.object({
    query: z.string().min(1).max(300),
    limit: z.number().int().min(1).max(15).default(8),
  }),
  async execute({ query, limit }, ctx) {
    const who = whoIsCalling(ctx);
    const list = await googleFetch<{ messages?: { id: string }[] }>(
      who,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q: query, maxResults: String(limit) })}`,
    );
    const messages = await Promise.all(
      (list.messages ?? []).map((m) =>
        googleFetch<MessageMeta>(
          who,
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?${new URLSearchParams([
            ["format", "metadata"], ["metadataHeaders", "From"], ["metadataHeaders", "Subject"], ["metadataHeaders", "Date"],
          ])}`,
        ),
      ),
    );
    return {
      messages: messages.map((m) => ({
        threadId: m.threadId,
        from: header(m.payload?.headers, "From"),
        subject: header(m.payload?.headers, "Subject"),
        date: header(m.payload?.headers, "Date"),
        snippet: m.snippet?.slice(0, 300),
      })),
    };
  },
});
