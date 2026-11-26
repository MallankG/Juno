import { defineChannel, POST } from "eve/channels";

import { listUsers, type User } from "../lib/accounts";
import { JOBS, jobSecretValid, promptFor, type JobName } from "../lib/jobs";
import { consumeGlobalTurn, tooMany } from "../lib/rate-limit";

/**
 * Runs a daily or weekly job for every person. Only the scheduled jobs call
 * this, with the CRON_SECRET bearer token. Each person's run is a separate
 * session, started as that person.
 *
 *   POST /eve/v1/jobs/run   { "job": "brief" | "auto" | "nightly" | "weekly" }
 */

const today = () => new Date().toISOString().slice(0, 10);

export default defineChannel({
  routes: [
    POST("/eve/v1/jobs/run", async (request, { from }) => {
      if (!jobSecretValid(request.headers.get("authorization"))) {
        return Response.json({ error: "Not allowed." }, { status: 401 });
      }
      const body = (await request.json().catch(() => ({}))) as { job?: string };
      const job = body.job as JobName;
      if (!JOBS.includes(job)) return Response.json({ error: "Unknown job." }, { status: 400 });

      const users = await listUsers();
      const targets = users.filter((user: User) => job !== "auto" || (user.google && user.autoRules.length > 0));
      let started = 0;
      for (const user of targets) {
        const address = `job:${job}:${user.username}:${today()}`;
        const verdict = await consumeGlobalTurn();
        if (!verdict.allowed) return tooMany({ ...verdict, reason: `${verdict.reason} Started ${started} of ${targets.length}.` });
        await from(address).send(promptFor(job, user), {
          auth: { authenticator: "jobs", principalType: "user", principalId: user.username, attributes: {} },
          idempotencyKey: address,
        });
        started++;
      }
      return Response.json({ ok: true, job, started }, { status: 202 });
    }),
  ],
});
