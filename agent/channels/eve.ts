import { localDev, TooManyRequestsError, vercelOidc } from "eve/channels/auth";
import { defaultEveAuth, eveChannel } from "eve/channels/eve";

import { accountAuth, ensureUser } from "../lib/accounts";
import { todayFor } from "../lib/festivals";
import { consumeChat } from "../lib/rate-limit";

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
    const verdict = await consumeChat(who);
    if (!verdict.allowed) throw new TooManyRequestsError({ retryAfter: verdict.retryAfter });
    const user = await ensureUser(who);
    const date = new Intl.DateTimeFormat("en-GB", {
      timeZone: user.timezone, weekday: "long", year: "numeric", month: "long", day: "numeric",
    }).format(new Date());
    const today = todayFor(user.timezone, user.birthday, user.createdAt);
    const context = [
      `Your name is ${user.agentName}. Introduce yourself by that name if asked.`,
      `You are talking with ${who}. Their time zone is ${user.timezone}. Today is ${date}, ${today.partOfDay} for them.`,
    ];
    if (today.festival) {
      context.push(
        `Today is ${today.festival.name} for them. If it fits the conversation, celebrate it warmly once ("${today.festival.greeting}") and use the celebrating mood for that reply.`,
      );
    }
    return { auth, clientContext: context };
  },
});
