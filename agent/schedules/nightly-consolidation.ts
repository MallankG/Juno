import { defineSchedule } from "eve/schedules";

/**
 * The learning step. Every night the agent reads what happened that day and
 * rewrites its picture of the user. Old facts are replaced by key, and facts
 * that feedback has weakened are removed.
 */
export default defineSchedule({
  cron: "30 2 * * *",
  timezone: "America/New_York",
  content: `Nightly memory review. Do not talk to anyone; just update memory.

1. Call learning__recent_episodes with days 1 to read today's exchanges and feedback.
2. For each feedback item with outcome "corrected" or "rejected", use supermemory__search to find the matching fact, then supermemory__forget it if it is wrong, and supermemory__remember the correction if the user gave one.
3. Save durable facts the user revealed today that memory does not have yet, using supermemory__remember. Only things that will still matter next month: people, projects, routines, preferences, goals.
4. Do not save one-off details (a single meeting, a passing mood, a password, a code).
5. Finish with a short internal note of what changed, under 80 words.`,
});
