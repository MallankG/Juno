/**
 * Optional Slack reader. Needs a bot token with channels:history and
 * channels:read scopes, and the bot invited to the channels in SLACK_CHANNEL_IDS.
 */
export function slackConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_IDS);
}

export async function slackHistory(channel: string, oldestUnix: number, limit: number) {
  const params = new URLSearchParams({
    channel,
    oldest: String(oldestUnix),
    limit: String(limit),
  });
  const response = await fetch(`https://slack.com/api/conversations.history?${params}`, {
    headers: { authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
  });
  const body = (await response.json()) as {
    ok: boolean;
    error?: string;
    messages?: { text?: string; user?: string; ts: string }[];
  };
  if (!body.ok) throw new Error(`Slack error: ${body.error ?? response.status}`);
  return body.messages ?? [];
}
