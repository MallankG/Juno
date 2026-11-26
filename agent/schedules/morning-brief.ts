import { defineSchedule } from "eve/schedules";

/**
 * Runs every morning at 07:00 New York time. The reply is discarded by a
 * markdown-style schedule, so the agent saves the brief with learning__save_brief,
 * and the user reads it later with "what's my brief?".
 *
 * Change `timezone` to your own IANA zone, for example "Europe/London".
 */
export default defineSchedule({
  cron: "0 7 * * *",
  timezone: "America/New_York",
  content: `It is the start of the day. Prepare the morning brief for the user.

1. Call supermemory__search for "user's priorities, people and routines" and learning__latest_brief so you know what matters to them.
2. Call calendar_list_events for today (from 00:00 to 23:59 in their timezone).
3. Call gmail_search with "is:unread newer_than:1d -category:promotions -category:social" to find mail that may need a reply today.
4. Call slack_recent_messages for the last 24 hours. If Slack is not connected, say so once in the brief.
5. Write the brief exactly as your instructions describe, including one motivational quote.
6. Call learning__save_brief with the full brief text.

Do not create calendar events in this run. Only propose them in the brief.`,
});
