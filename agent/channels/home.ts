import { defineChannel, GET } from "eve/channels";

import { webAssets } from "../lib/web-assets";

/**
 * Serves the phone app (built from web/ with Effect UI) at the root of the
 * deployment: the page, its bundle, manifest, service worker and icons.
 *
 * The page itself is not secret. Its API calls go to /eve/v1/* with a
 * sign-in token, so the browser never shows a password pop-up.
 */
function asset(path: string) {
  return GET(path, async () => {
    const file = webAssets[path];
    if (!file) return new Response("Not found", { status: 404 });
    const bytes = file.binary ? Uint8Array.from(atob(file.body), (c) => c.charCodeAt(0)) : file.body;
    return new Response(bytes, {
      headers: {
        "content-type": file.type,
        "cache-control": file.immutable ? "public, max-age=31536000, immutable" : "no-cache",
      },
    });
  });
}

export default defineChannel({
  routes: Object.keys(webAssets).map(asset),
});
