import { vercelOidc, localDev } from "eve/channels/auth";
import { defaultEveAuth, eveChannel } from "eve/channels/eve";

import { accountAuth, ensureUser } from "../lib/accounts";

/**
 * The HTTP API for the phone app and the terminal UI.
 *
 * Auth: a person's username and password, Vercel OIDC for your team's
 * deployments, and local development requests.
 *
 * Each message carries the person's agent name and time zone as per-turn
 * context. That context is not saved in the conversation history.
 */
export default eveChannel({
  auth: [accountAuth, localDev(), vercelOidc()],
  async onMessage(ctx, _message) {
    const auth = defaultEveAuth(ctx);
    if (!auth) throw new Error("Sign in to continue.");
    const who = auth.principalId;
    const user = await ensureUser(who);
    const today = new Intl.DateTimeFormat("en-GB", {
      timeZone: user.timezone, weekday: "long", year: "numeric", month: "long", day: "numeric",
    }).format(new Date());
    return {
      auth,
      clientContext: [
        `Your name is ${user.agentName}. Introduce yourself by that name if asked.`,
        `You are talking with ${who}. Their time zone is ${user.timezone}. Today is ${today}.`,
      ],
    };
  },
});
