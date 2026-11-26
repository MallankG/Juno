import { createHmac, timingSafeEqual } from "node:crypto";

import { findUser, updateUser } from "./accounts";

/**
 * Google Calendar and Gmail for each person, using their own connection.
 *
 * One Google Cloud OAuth client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) serves
 * everyone. Each person connects their own account from the settings page; the
 * refresh token is stored on their account.
 *
 * Redirect URI to register in Google Cloud: <APP_URL>/eve/v1/google/callback
 */

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:2000";
}

export const redirectUri = () => `${appUrl()}/eve/v1/google/callback`;

/** Signed state so a callback can only complete a connection that this server started. */
export function signState(username: string): string {
  const mac = createHmac("sha256", process.env.GOOGLE_CLIENT_SECRET ?? "").update(`state:${username}`).digest("base64url");
  return `${Buffer.from(username).toString("base64url")}.${mac}`;
}

export function verifyState(state: string): string | null {
  const [encoded, mac] = state.split(".");
  if (!encoded || !mac) return null;
  const username = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = Buffer.from(signState(username).split(".")[1]);
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return username;
}

export function connectUrl(username: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: signState(username),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string): Promise<{ refresh_token?: string; id_token?: string }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error(`Google sign-in failed (HTTP ${response.status}).`);
  return (await response.json()) as { refresh_token?: string; id_token?: string };
}

export async function storeConnection(username: string, tokens: { refresh_token?: string }) {
  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token. Remove the app's access in your Google account and connect again.");
  }
  await updateUser(username, (user) => {
    user.google = { refreshToken: tokens.refresh_token! };
  });
}

export async function disconnect(username: string): Promise<void> {
  await updateUser(username, (user) => {
    delete user.google;
  });
}

// Access tokens last an hour; cache them per person in memory.
const cache = new Map<string, { token: string; expiresAt: number }>();

async function accessToken(username: string): Promise<string> {
  const cached = cache.get(username);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const user = await findUser(username);
  const refreshToken = user?.google?.refreshToken;
  if (!refreshToken) throw new Error("Google is not connected. Connect it in the settings page first.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (response.status === 400 || response.status === 401) {
    throw new Error("Google access expired. Connect Google again in the settings page.");
  }
  if (!response.ok) throw new Error(`Google token refresh failed (HTTP ${response.status}).`);
  const body = (await response.json()) as { access_token: string; expires_in: number };
  cache.set(username, { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 });
  return body.access_token;
}

/** Calls a Google API as one person. */
export async function googleFetch<T>(username: string, url: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken(username);
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google API ${response.status}: ${detail.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}
