import { defineTool } from "eve/tools";
import { z } from "zod";

import { slackConfigured, slackHistory } from "../lib/slack";

export default defineTool({
  description:
    "Read recent messages from the Slack channels the user has connected (set SLACK_CHANNEL_IDS). Returns text, sender id and time. Use it to find requests, deadlines, and invitations.",
  label: { start: () => "Read recent Slack messages" },
  inputSchema: z.object({
    hours: z.number().min(1).max(168).default(24),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute({ hours, limit }) {
    if (!slackConfigured()) {
      return { messages: [], note: "Slack is not connected (SLACK_BOT_TOKEN and SLACK_CHANNEL_IDS are not set)." };
    }
    const channels = process.env.SLACK_CHANNEL_IDS!.split(",").map((c) => c.trim()).filter(Boolean);
    const oldest = Math.floor(Date.now() / 1000 - hours * 3600);
    const results = await Promise.all(
      channels.map(async (channel) => {
        const messages = await slackHistory(channel, oldest, limit);
        return messages.map((m) => ({
          channel,
          from: m.user,
          text: (m.text ?? "").slice(0, 500),
          at: new Date(Number(m.ts) * 1000).toISOString(),
        }));
      }),
    );
    return { messages: results.flat().slice(0, limit) };
  },
});
