import { BrowserHost } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { App } from "./App.ts"
import { TOKEN_KEY } from "./platform/api.ts"
import { unlockAudio } from "./platform/voice.ts"
import "./styles.css"

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const history = (() => {
  try {
    const parsed: unknown = JSON.parse(read("junoHistory") ?? "[]")
    return Array.isArray(parsed)
      ? parsed.filter((l): l is { role: "u" | "a"; text: string } =>
        !!l && typeof l === "object" && (l.role === "u" || l.role === "a") && typeof l.text === "string")
      : []
  } catch {
    return []
  }
})()

// Phones only play audio after a tap; unlock it on the first one.
document.addEventListener("pointerdown", unlockAudio, { capture: true, once: true })

const url = new URL(window.location.href)
const connectedGoogle = url.searchParams.get("connected") === "google"
if (url.search) window.history.replaceState(null, "", url.pathname)

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {})
}

const root = document.getElementById("root")
if (root) {
  Layer.launch(
    BrowserHost.mount(App, {
      token: read(TOKEN_KEY),
      history,
      sessionId: read("sessionId"),
      speakOn: read("speak") !== "off",
      seasonOn: read("season") !== "off",
      connectedGoogle
    }, root)
  ).pipe(Effect.runFork)
}
