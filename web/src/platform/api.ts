/**
 * The agent's HTTP API, as plain promises. Commands wrap these and turn
 * every outcome into a message, so nothing here touches the UI.
 */

export const TOKEN_KEY = "junoToken"

export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export interface RequestOptions {
  readonly method?: string
  readonly body?: unknown
  readonly raw?: Blob
  readonly contentType?: string
}

/** Friendly text for an error response, including rate limits (429). */
export const explain = (status: number, retryAfter: string | null, data: unknown): string => {
  if (status === 429) {
    const s = Number(retryAfter ?? (data as { retryAfter?: number } | null)?.retryAfter ?? 0) || 30
    if (s >= 3600) {
      const h = Math.ceil(s / 3600)
      return `I've reached today's limit. Let's talk again in about ${h} hour${h === 1 ? "" : "s"}.`
    }
    if (s >= 60) return `I need a short break. Try again in about ${Math.ceil(s / 60)} minutes.`
    return `I need a short break. Try again in ${s} seconds.`
  }
  if (status === 401) return "Please sign in again."
  const error = (data as { error?: unknown } | null)?.error
  return typeof error === "string" && error ? error : `Something went wrong (${status}).`
}

export const request = (token: string, path: string, options: RequestOptions = {}): Promise<Response> => {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  let body: BodyInit | undefined
  if (options.raw) {
    body = options.raw
    headers["content-type"] = options.contentType ?? options.raw.type
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body)
    headers["content-type"] = "application/json"
  }
  return fetch(path, { method: options.method ?? (body ? "POST" : "GET"), headers, ...(body ? { body } : {}) })
}

/** Sends a request and returns its JSON, or throws an ApiFailure with friendly text. */
export const call = async (token: string, path: string, options: RequestOptions = {}): Promise<unknown> => {
  const res = await request(token, path, options)
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new ApiFailure(explain(res.status, res.headers.get("retry-after"), data), res.status)
  return data
}

export const failureOf = (error: unknown): { reason: string; status: number } =>
  error instanceof ApiFailure
    ? { reason: error.message, status: error.status }
    : { reason: error instanceof Error ? error.message : "Something went wrong.", status: 0 }

/** Reads where a session's event stream ends, so a new turn reads only new events. */
export const streamTail = async (token: string, sessionId: string): Promise<number> => {
  const res = await request(token, `/eve/v1/session/${sessionId}/stream?startIndex=0&follow=false`)
  if (res.status === 409 || res.status === 410) throw new ApiFailure("The session is no longer active.", res.status)
  if (!res.ok) throw new ApiFailure(explain(res.status, res.headers.get("retry-after"), null), res.status)
  const header = res.headers.get("x-eve-stream-tail-index")
  const text = await res.text()
  if (header !== null && !Number.isNaN(Number(header))) return Number(header)
  return text.split("\n").filter(Boolean).length
}

export interface StreamEvent {
  readonly type: string
  readonly data: Record<string, unknown>
}

/** Every event in one stream line. Lines look like { at, facts: [{ type, data }] }. */
export const eventsOf = (record: unknown, out: Array<StreamEvent> = []): Array<StreamEvent> => {
  if (Array.isArray(record)) record.forEach((r) => eventsOf(r, out))
  else if (record && typeof record === "object") {
    const r = record as Record<string, unknown>
    if (typeof r.type === "string") out.push({ type: r.type, data: (r.data ?? {}) as Record<string, unknown> })
    for (const key of ["facts", "progress", "events", "records"]) {
      if (Array.isArray(r[key])) (r[key] as Array<unknown>).forEach((x) => eventsOf(x, out))
    }
  }
  return out
}

/** Reads a turn's events as they arrive. Calls onEvent for each, and stops when signal aborts. */
export const followTurn = async (
  token: string,
  sessionId: string,
  startIndex: number,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal
): Promise<void> => {
  const res = await fetch(`/eve/v1/session/${sessionId}/stream?startIndex=${startIndex}&follow=true`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    signal
  })
  if (!res.ok || !res.body) throw new ApiFailure(explain(res.status, null, null), res.status)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line) continue
        let parsed: unknown
        try {
          parsed = JSON.parse(line)
        } catch {
          continue
        }
        for (const event of eventsOf(parsed)) onEvent(event)
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }
}
