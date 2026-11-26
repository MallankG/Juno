import { defineChannel, POST } from "eve/channels";

import { requireAssistant } from "../lib/auth";

/**
 * Speech for the voice page, provided by Deepgram (free $200 credit, no expiry).
 *
 *   POST /eve/v1/voice/transcribe   raw audio bytes  -> { text }
 *   POST /eve/v1/voice/speak        { text }         -> audio/mpeg
 *
 * Both need DEEPGRAM_API_KEY. The page's audio never leaves your own deployment
 * except to Deepgram, and the calls are authenticated like the rest of the API.
 */

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_SPEAK_CHARS = 1800; // Deepgram's limit is 2000 for Aura-2

const deepgramKey = () => process.env.DEEPGRAM_API_KEY;

function missingKey(): Response {
  return Response.json(
    { error: "Voice is not configured. Set DEEPGRAM_API_KEY on the agent." },
    { status: 503 },
  );
}

export default defineChannel({
  routes: [
    POST("/eve/v1/voice/transcribe", async (request) => {
      const denied = await requireAssistant(request);
      if (denied) return denied;
      const key = deepgramKey();
      if (!key) return missingKey();

      const type = request.headers.get("content-type") || "audio/webm";
      const audio = await request.arrayBuffer();
      if (audio.byteLength === 0) return Response.json({ error: "No audio received." }, { status: 400 });
      if (audio.byteLength > MAX_AUDIO_BYTES) {
        return Response.json({ error: "Recording is too long. Keep it under a minute." }, { status: 413 });
      }

      const params = new URLSearchParams({ model: "nova-3", smart_format: "true", language: "en" });
      const response = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
        method: "POST",
        headers: { authorization: `Token ${key}`, "content-type": type },
        body: audio,
      });
      if (!response.ok) {
        return Response.json({ error: `Transcription failed (${response.status}).` }, { status: 502 });
      }
      const data = (await response.json()) as {
        results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
      };
      const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
      return Response.json({ text });
    }),

    POST("/eve/v1/voice/speak", async (request) => {
      const denied = await requireAssistant(request);
      if (denied) return denied;
      const key = deepgramKey();
      if (!key) return missingKey();

      const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
      const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_SPEAK_CHARS) : "";
      if (!text) return Response.json({ error: "Nothing to say." }, { status: 400 });

      const params = new URLSearchParams({ model: "aura-2-thalia-en" });
      const response = await fetch(`https://api.deepgram.com/v1/speak?${params}`, {
        method: "POST",
        headers: { authorization: `Token ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok || !response.body) {
        return Response.json({ error: `Speech failed (${response.status}).` }, { status: 502 });
      }
      return new Response(response.body, {
        headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
      });
    }),
  ],
});
