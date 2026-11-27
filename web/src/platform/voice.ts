/**
 * The microphone and the speaker. These hold browser objects (a recorder, an
 * audio element), which never go in a Model, so they live here and Commands
 * call them.
 */
import { request, ApiFailure, explain } from "./api.ts"

const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="

const player = typeof Audio === "undefined" ? null : new Audio()
if (player) {
  player.setAttribute("playsinline", "")
  player.preload = "auto"
}

/**
 * iPhone Safari only plays sound that starts during a tap. main.ts calls this
 * on every tap, so later replies can play.
 */
export const unlockAudio = (): void => {
  if (!player || !player.paused) return
  player.src = SILENT
  player.play().catch(() => {})
}

let stopRequested = false

const chunksOf = (text: string): Array<string> => {
  const out: Array<string> = []
  let rest = text.trim()
  while (rest) {
    if (rest.length <= 1800) {
      out.push(rest)
      break
    }
    let cut = rest.lastIndexOf(". ", 1800)
    if (cut < 200) cut = rest.lastIndexOf(" ", 1800)
    if (cut < 1) cut = 1800
    out.push(rest.slice(0, cut + 1))
    rest = rest.slice(cut + 1).trim()
  }
  return out
}

const playUrl = (url: string): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!player) return resolve()
    const done = () => {
      player.onended = null
      player.onpause = null
      URL.revokeObjectURL(url)
      resolve()
    }
    player.onended = done
    player.onpause = done
    player.src = url
    player.play().catch((error: unknown) => {
      URL.revokeObjectURL(url)
      reject(error instanceof Error ? error : new Error("Audio could not play."))
    })
  })

/** Speaks text with Deepgram through the agent. Resolves when it finishes or is stopped. */
export const speak = async (token: string, text: string): Promise<void> => {
  stopRequested = false
  for (const chunk of chunksOf(text)) {
    if (stopRequested) return
    const res = await request(token, "/eve/v1/voice/speak", { body: { text: chunk } })
    if (!res.ok) {
      const data: unknown = await res.json().catch(() => null)
      throw new ApiFailure(explain(res.status, res.headers.get("retry-after"), data), res.status)
    }
    const url = URL.createObjectURL(await res.blob())
    if (stopRequested) {
      URL.revokeObjectURL(url)
      return
    }
    await playUrl(url)
  }
}

export const stopSpeaking = (): void => {
  stopRequested = true
  try {
    player?.pause()
  } catch {
    // nothing playing
  }
}

// ---- recording ------------------------------------------------------------

let recorder: MediaRecorder | null = null
let stream: MediaStream | null = null
let chunks: Array<Blob> = []

const pickMime = (): string | undefined =>
  ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find(
    (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)
  )

export const startRecording = async (): Promise<void> => {
  if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
    throw new Error("This browser can't record. Tap the keyboard to type instead.")
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    throw new Error("I can't hear you. Allow the microphone in your browser settings.")
  }
  const mime = pickMime()
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  chunks = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data)
  }
  recorder.start()
}

const stopTracks = () => {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
}

/** Stops recording and sends the audio to the agent for transcription. Returns the text. */
export const stopAndTranscribe = (token: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = recorder
    if (!r || r.state !== "recording") {
      stopTracks()
      return resolve("")
    }
    r.onstop = async () => {
      stopTracks()
      recorder = null
      const type = (r.mimeType || "audio/webm").split(";")[0] ?? "audio/webm"
      const blob = new Blob(chunks, { type })
      if (blob.size < 1000) return resolve("")
      try {
        const res = await request(token, "/eve/v1/voice/transcribe", { raw: blob, contentType: type })
        const data = (await res.json().catch(() => null)) as { text?: string } | null
        if (!res.ok) throw new ApiFailure(explain(res.status, res.headers.get("retry-after"), data), res.status)
        resolve((data?.text ?? "").trim())
      } catch (error) {
        reject(error)
      }
    }
    r.stop()
  })

export const cancelRecording = (): void => {
  if (recorder && recorder.state === "recording") {
    recorder.onstop = null
    recorder.stop()
  }
  recorder = null
  stopTracks()
}
