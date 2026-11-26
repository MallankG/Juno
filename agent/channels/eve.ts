import { localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

/**
 * The HTTP API used by the terminal UI and by the voice page in /voice.
 *
 * Route auth still applies: `localDev()` admits local requests, and
 * `vercelOidc()` admits your team's deployments. Add your own auth before
 * exposing the agent publicly.
 *
 * `cors: true` lets the browser voice page in /voice call the API directly.
 */
export default eveChannel({
  auth: [vercelOidc(), localDev()],
  cors: true,
});
