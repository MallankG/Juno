import { sendNotification, setVapidDetails, type PushSubscription } from "web-push";

import { updateUser, findUser } from "./accounts";

/**
 * Web push to the phone app. Needs VAPID keys (free; generate with
 * `npx web-push generate-vapid-keys`). iPhone needs the app added to the home
 * screen (iOS 16.4 or later) before it can receive pushes.
 */

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

function configure() {
  setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:owner@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

export async function saveSubscription(username: string, subscription: unknown): Promise<void> {
  await updateUser(username, (user) => {
    const endpoint = (subscription as { endpoint?: string }).endpoint;
    user.push = user.push.filter((s) => (s as { endpoint?: string }).endpoint !== endpoint);
    user.push.push(subscription);
  });
}

/** Sends a notification to every device a person subscribed. Returns how many were sent. */
export async function notify(username: string, payload: { title: string; body: string; url?: string }): Promise<number> {
  if (!pushConfigured()) return 0;
  const user = await findUser(username);
  if (!user || user.push.length === 0) return 0;
  configure();
  let sent = 0;
  const dead: unknown[] = [];
  for (const subscription of user.push) {
    try {
      await sendNotification(subscription as PushSubscription, JSON.stringify(payload), { TTL: 60 * 60 * 6 });
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) dead.push(subscription); // device unsubscribed
    }
  }
  if (dead.length) {
    await updateUser(username, (u) => {
      u.push = u.push.filter((s) => !dead.includes(s));
    });
  }
  return sent;
}
