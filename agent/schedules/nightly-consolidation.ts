import { defineSchedule } from "eve/schedules";

import { triggerJob } from "../lib/jobs";

/** 02:30 New York time: each person's memory review. */
export default defineSchedule({
  cron: "30 2 * * *",
  timezone: "America/New_York",
  async run() {
    await triggerJob("nightly");
  },
});
