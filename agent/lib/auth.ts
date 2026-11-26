import { httpBasic, localDev, routeAuth } from "eve/channels/auth";

/**
 * Who may use the assistant over HTTP.
 *
 * Set ASSISTANT_USERNAME and ASSISTANT_PASSWORD. Phones and browsers show a
 * native sign-in prompt once and remember it, so the voice page never handles
 * the password itself. Local development (`eve dev`) is always allowed.
 */
const username = process.env.ASSISTANT_USERNAME ?? "";
const password = process.env.ASSISTANT_PASSWORD ?? "";

export const assistantAuth = [
  // httpBasic with empty credentials rejects everything, so the app stays locked
  // until both variables are set.
  httpBasic({ username: username || "__unset__", password: password || "__unset__" }, { realm: "Your assistant" }),
  localDev(),
];

/** Call at the top of a route handler. Returns a 401 Response, or null when allowed. */
export async function requireAssistant(request: Request): Promise<Response | null> {
  const result = await routeAuth(request, assistantAuth);
  return result instanceof Response ? result : null;
}
