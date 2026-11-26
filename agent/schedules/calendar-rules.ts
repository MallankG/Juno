import { defineSchedule } from "eve/schedules";

import { triggerJob } from "../lib/jobs";

/** 06:30 New York time: adds this week's events from each person's approved rules. */
export default defineSchedule({
  cron: "30 6 * * *",
  timezone: "America/New_York",
  async run() {
    await triggerJob("auto");
  },
});
