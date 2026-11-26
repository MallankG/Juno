import { defineSchedule } from "eve/schedules";

import { triggerJob } from "../lib/jobs";

/** Sunday 18:00 New York time: each person's weekly review. */
export default defineSchedule({
  cron: "0 18 * * 0",
  timezone: "America/New_York",
  async run() {
    await triggerJob("weekly");
  },
});
