import { defineSchedule } from "eve/schedules";

import { triggerJob } from "../lib/jobs";

/** 07:00 New York time: each person's morning brief, triage drafts and quote. */
export default defineSchedule({
  cron: "0 7 * * *",
  timezone: "America/New_York",
  async run() {
    await triggerJob("brief");
  },
});
