import { defineChannel, GET, POST } from "eve/channels";

import { authenticate, ensureUser, publicProfile, register, updateUser, USERNAME_PATTERN, type User } from "../lib/accounts";
import { connectUrl, disconnect, exchangeCode, googleConfigured, storeConnection, verifyState } from "../lib/google";
import { pushConfigured, saveSubscription, vapidPublicKey, notify } from "../lib/push";
import { clientIp, consumeRegister, tooMany } from "../lib/rate-limit";

/**
 * Accounts, settings, Google connection and push notifications.
 *
 *   POST /eve/v1/account/register        create an account (invite code)
 *   GET  /eve/v1/account                 your profile and settings
 *   POST /eve/v1/account/settings        agent name, avatar, time zone
 *   POST /eve/v1/account/rules/remove    remove an automatic calendar rule
 *   GET  /eve/v1/google/connect          start connecting your Google account
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

const AVATAR_PRESETS = ["juno", "orb-ember", "orb-ocean", "orb-moss", "orb-dusk", "orb-sand", "custom"];
const MAX_AVATAR_BYTES = 200 * 1024;

async function readBody(request: Request): Promise<Record<string, unknown>> {
  return ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
}

export default defineChannel({
  routes: [
    POST("/eve/v1/account/register", async (request) => {
      const attempt = await consumeRegister(clientIp(request));
      if (!attempt.allowed) return tooMany(attempt);
      const body = await readBody(request);
      try {
        const username = String(body.username ?? "").trim().toLowerCase();
        if (!USERNAME_PATTERN.test(username)) {
          throw new Error("Use 3 to 24 letters, numbers, dashes or underscores for the username.");
        }
        const user = await register(username, String(body.password ?? ""), String(body.inviteCode ?? ""));
        return json({ ok: true, username: user.username });
      } catch (error) {
        return errorResponse(error);
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
            if (!AVATAR_PRESETS.includes(body.avatar)) throw new Error("Choose one of the avatars offered.");
            user.avatar = body.avatar;
            if (body.avatar !== "custom") delete user.avatarData;
          }
          if (typeof body.avatarData === "string") {
            const match = /^data:image\/(png|jpeg|webp);base64,/.exec(body.avatarData);
            if (!match) throw new Error("Upload a PNG, JPEG or WebP image.");
            if (body.avatarData.length * 0.75 > MAX_AVATAR_BYTES) throw new Error("Use an image under 200 KB.");
            user.avatar = "custom";
            user.avatarData = body.avatarData;
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

    GET("/eve/v1/google/connect", async (request) => {
      const who = await authenticate(request);
      if ("response" in who) return who.response;
      if (!googleConfigured()) return page("Google is not set up", "The owner needs to add Google credentials first.");
      return new Response(null, { status: 302, headers: { location: connectUrl(who.username) } });
    }),

    GET("/eve/v1/google/callback", async (request) => {
      const url = new URL(request.url);
      const username = verifyState(url.searchParams.get("state") ?? "");
      const code = url.searchParams.get("code");
      if (!username || !code) return page("Could not connect", "This link is not valid or has expired. Try connecting again from settings.");
      try {
        await storeConnection(username, await exchangeCode(code));
        return page("Google connected", "Your calendar and mail are connected. You can close this page.");
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
