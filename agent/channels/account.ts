import { defineChannel, GET, POST } from "eve/channels";

import {
  authenticate, checkPassword, ensureUser, inviteRequired, issueToken, AVATAR_IMAGE, AVATAR_IMAGE_MAX, publicProfile, register, SKINS, updateUser,
  USERNAME_PATTERN, type User,
} from "../lib/accounts";
import { connectUrl, disconnect, exchangeCode, googleConfigured, storeConnection, verifyState } from "../lib/google";
import { pushConfigured, saveSubscription, vapidPublicKey, notify } from "../lib/push";
import { clientIp, consumeLogin, consumeRegister, tooMany } from "../lib/rate-limit";

/**
 * Accounts, settings, Google connection and push notifications.
 *
 *   GET  /eve/v1/account/config          public: is an invite code needed?
 *   POST /eve/v1/account/register        create an account; returns a sign-in token
 *   POST /eve/v1/account/login           sign in; returns a sign-in token
 *   GET  /eve/v1/account                 your profile, settings and today's celebration
 *   POST /eve/v1/account/settings        name, skin, time zone, birthday
 *   POST /eve/v1/account/rules/remove    remove an automatic calendar rule
 *   POST /eve/v1/google/connect-url      the Google consent link to open
 *   GET  /eve/v1/google/callback         Google sends you back here
 *   POST /eve/v1/google/disconnect       forget your Google connection
 *   GET  /eve/v1/push/key                public key for push subscriptions
 *   POST /eve/v1/push/subscribe          register this phone for notifications
 *   POST /eve/v1/push/test               send yourself a test notification
 */

const json = (body: unknown, status = 200) => Response.json(body, { status });

const errorResponse = (error: unknown, status = 400) =>
  json({ error: error instanceof Error ? error.message : "Something went wrong." }, status);

const page = (title: string, message: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${title}</title><body style="font:17px system-ui;padding:24px;max-width:520px;margin:auto">` +
      `<h2>${title}</h2><p>${message}</p><p><a href="/">Back to your assistant</a></p></body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );


async function readBody(request: Request): Promise<Record<string, unknown>> {
  return ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
}

export default defineChannel({
  routes: [
    GET("/eve/v1/account/config", async () => json({ inviteRequired: inviteRequired() })),

    POST("/eve/v1/account/register", async (request) => {
      const attempt = await consumeRegister(clientIp(request));
      if (!attempt.allowed) return tooMany(attempt);
      const body = await readBody(request);
      try {
        const username = String(body.username ?? "").trim().toLowerCase();
        if (!USERNAME_PATTERN.test(username)) {
          throw new Error("Use 3 to 24 lowercase letters, numbers, dashes or underscores for the username.");
        }
        const user = await register(username, String(body.password ?? ""), String(body.inviteCode ?? ""));
        return json({ ok: true, token: issueToken(user.username), profile: publicProfile(user) });
      } catch (error) {
        return errorResponse(error);
      }
    }),

    POST("/eve/v1/account/login", async (request) => {
      const attempt = await consumeLogin(clientIp(request));
      if (!attempt.allowed) return tooMany(attempt);
      const body = await readBody(request);
      try {
        const username = await checkPassword(String(body.username ?? ""), String(body.password ?? ""));
        if (!username) return json({ error: "That username and password don't match." }, 401);
        return json({ ok: true, token: issueToken(username), profile: publicProfile(await ensureUser(username)) });
      } catch (error) {
        return errorResponse(error, 500);
      }
    }),

    GET("/eve/v1/account", async (request) => {
      const who = await authenticate(request);
      if ("response" in who) return who.response;
      return json(publicProfile(await ensureUser(who.username)));
    }),

    POST("/eve/v1/account/settings", async (request) => {
      const who = await authenticate(request);
      if ("response" in who) return who.response;
      const body = await readBody(request);
      try {
        const updated = await updateUser(who.username, (user: User) => {
          if (typeof body.agentName === "string") {
            const name = body.agentName.trim();
            if (!/^[\p{L}\p{N} '\-]{1,24}$/u.test(name)) {
              throw new Error("The name can be 1 to 24 letters, numbers, spaces, apostrophes or dashes.");
            }
            user.agentName = name;
          }
          if (typeof body.timezone === "string") {
            try {
              new Intl.DateTimeFormat("en-US", { timeZone: body.timezone });
            } catch {
              throw new Error("That time zone is not recognised. Use a name like Europe/London.");
            }
            user.timezone = body.timezone;
          }
          if (typeof body.avatar === "string") {
            if (!(SKINS as readonly string[]).includes(body.avatar)) throw new Error("Choose one of the looks offered.");
            user.avatar = body.avatar;
            delete user.avatarData;
          }
          if (body.avatarImage === null) delete user.avatarData;
          else if (typeof body.avatarImage === "string") {
            if (body.avatarImage.length > AVATAR_IMAGE_MAX) throw new Error("That picture is too large. Try a smaller one.");
            if (!AVATAR_IMAGE.test(body.avatarImage)) throw new Error("Use a PNG, JPEG or WebP picture.");
            user.avatarData = body.avatarImage;
          }
          if (body.birthday === "" || body.birthday === null) delete user.birthday;
          else if (typeof body.birthday === "string") {
            const m = /^(\d{2})-(\d{2})$/.exec(body.birthday);
            const valid = m && Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2]) >= 1 && Number(m[2]) <= 31;
            if (!valid) throw new Error("Enter the birthday as month and day.");
            user.birthday = body.birthday;
          }
          return publicProfile(user);
        });
        return json(updated);
      } catch (error) {
        return errorResponse(error);
      }
    }),

    POST("/eve/v1/account/rules/remove", async (request) => {
      const who = await authenticate(request);
      if ("response" in who) return who.response;
      const body = await readBody(request);
      const id = String(body.id ?? "");
      await updateUser(who.username, (user) => {
        user.autoRules = user.autoRules.filter((r) => r.id !== id);
      });
      return json(publicProfile(await ensureUser(who.username)));
    }),

    POST("/eve/v1/google/connect-url", async (request) => {
      const who = await authenticate(request);
      if ("response" in who) return who.response;
      if (!googleConfigured()) return errorResponse(new Error("Google isn't set up on this assistant yet."), 503);
      return json({ url: connectUrl(who.username) });
    }),

    GET("/eve/v1/google/callback", async (request) => {
      const url = new URL(request.url);
      const username = verifyState(url.searchParams.get("state") ?? "");
      const code = url.searchParams.get("code");
      if (!username || !code) return page("Could not connect", "This link is not valid or has expired. Try connecting again from settings.");
      try {
        await storeConnection(username, await exchangeCode(code));
        return new Response(null, { status: 302, headers: { location: "/?connected=google" } });
      } catch (error) {
        return page("Could not connect", error instanceof Error ? error.message : "Try again.");
      }
    }),

    POST("/eve/v1/google/disconnect", async (request) => {
      const who = await authenticate(request);
      if ("response" in who) return who.response;
      await disconnect(who.username);
      return json(publicProfile(await ensureUser(who.username)));
    }),

    GET("/eve/v1/push/key", async () => {
      if (!pushConfigured()) return json({ publicKey: null, reason: "Notifications are not set up on this agent." });
      return json({ publicKey: vapidPublicKey() });
    }),

    POST("/eve/v1/push/subscribe", async (request) => {
      const who = await authenticate(request);
      if ("response" in who) return who.response;
      if (!pushConfigured()) return errorResponse(new Error("Notifications are not set up on this agent."), 503);
      const subscription = await readBody(request);
      if (typeof subscription.endpoint !== "string") return errorResponse(new Error("Invalid subscription."));
      await saveSubscription(who.username, subscription);
      return json({ ok: true });
    }),

    POST("/eve/v1/push/test", async (request) => {
      const who = await authenticate(request);
      if ("response" in who) return who.response;
      const sent = await notify(who.username, { title: "It works", body: "Notifications are on for your assistant.", url: "/" });
      return json({ sent });
    }),
  ],
});
