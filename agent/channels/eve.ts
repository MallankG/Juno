import { vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

import { assistantAuth } from "../lib/auth";

/**
 * The HTTP API used by the voice page and the terminal UI.
 *
 * Auth: a username and password (ASSISTANT_USERNAME / ASSISTANT_PASSWORD) for
 * your phone and browser, Vercel OIDC for your team's deployments, and local
 * development requests.
 *
 * The voice page is served from the same origin, so no CORS is needed.
 */
export default eveChannel({
  auth: [...assistantAuth, vercelOidc()],
});
