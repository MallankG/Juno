import { timingSafeEqual } from "node:crypto";

import { type User } from "./accounts";
import { appUrl } from "./google";

/**
 * Daily and weekly jobs. Each job runs once for every person, as that person,
 * so their memory, calendar and mail are used and kept separate.
 */

export type JobName = "brief" | "auto" | "nightly" | "weekly";
export const JOBS: JobName[] = ["brief", "auto", "nightly", "weekly"];

const dayIn = (zone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function promptFor(job: JobName, user: User): string {
  const tz = user.timezone;
  const today = dayIn(tz);
  const name = user.agentName;
  switch (job) {
    case "brief":
      return `Morning brief for ${today}. Your name is ${name}. Prepare it now:
1. Call learning__latest_brief (kind daily) and supermemory__search for this person's priorities, people and routines.
2. Call calendar_list_events for today (from 00:00 to 23:59 in ${tz}).
3. Call gmail_search with "is:unread newer_than:1d -category:promotions -category:social". For each message that clearly needs a reply today, write a short reply and save it with gmail_create_draft, using the message's threadId. Never send mail.
4. Call slack_recent_messages for the last 24 hours. If Slack is not connected, say so once.
5. Write the brief as your instructions describe, including one motivational quote.
6. Call learning__save_brief with kind "daily" and the full brief text.
Do not create calendar events in this run; only propose them in the brief. Finish with one line saying how many drafts you saved.`;
    case "auto":
      return `Calendar rules for ${today}. Call auto_rules_run once. If it added events, reply with one short line listing them. If it added nothing, reply with nothing at all.`;
    case "nightly":
      return `Nightly memory review for ${today}. Do not talk to anyone; just update memory.
1. Call learning__recent_episodes with days 1.
2. For each feedback item with outcome "corrected" or "rejected", use supermemory__search to find the matching fact, then supermemory__forget it if it is wrong, and supermemory__remember the correction if the person gave one.
3. Save durable facts they revealed today that memory does not have yet, using supermemory__remember. Only things that will still matter next month.
4. Do not save one-off details (a single meeting, a passing mood, a password, a code).
5. Finish with a short internal note of what changed, under 80 words.`;
    case "weekly":
      return `Weekly review for the week ending ${today}. Your name is ${name}.
1. Call learning__recent_episodes with days 7 and calendar_list_events for the last 7 days and the next 7 days (time zone ${tz}).
2. Write a weekly review under 300 words: what went well, what is coming up, three suggestions, and one short quote.
3. Call learning__save_brief with kind "weekly" and the full text.`;
  }
}

/** Runs authenticate-free checks for the scheduled caller. */
export function jobSecretValid(header: string | null): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Called by the schedule files: asks the agent to run a job for everyone. */
export async function triggerJob(job: JobName): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is not set, so scheduled jobs cannot run.");
  const response = await fetch(`${appUrl()}/eve/v1/jobs/run`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ job }),
  });
  if (!response.ok) throw new Error(`Job ${job} failed to start (HTTP ${response.status}).`);
}
