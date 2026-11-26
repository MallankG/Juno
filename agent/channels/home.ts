import { defineChannel, GET } from "eve/channels";

import { voiceAssets } from "../lib/voice-assets";

/**
 * Serves the phone app at the root of the deployment: the page, its manifest,
 * service worker and icons (all embedded from voice/ by scripts/embed-voice.mjs).
 *
 * The page itself is not secret. Its API calls go to /eve/v1/*, which asks the
 * browser for the username and password.
 */
function asset(path: string) {
  return GET(path, async () => {
    const file = voiceAssets[path];
    if (!file) return new Response("Not found", { status: 404 });
    const bytes = file.binary ? Uint8Array.from(atob(file.body), (c) => c.charCodeAt(0)) : file.body;
    return new Response(bytes, {
      headers: { "content-type": file.type, "cache-control": "no-cache" },
    });
  });
}

export default defineChannel({
  routes: Object.keys(voiceAssets).map(asset),
});
