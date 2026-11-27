import { updateDoc, readDoc } from "./store";

/**
 * Rate limits, kept in the same durable store as everything else.
 *
 * Fixed windows: each bucket counts events in the current minute, hour or day
 * (UTC). Limits are set with environment variables, with safe defaults:
 *
 *   RL_CHAT_PER_MINUTE        10    chat messages per person per minute
 *   RL_CHAT_PER_DAY          200    chat messages per person per day
 *   RL_VOICE_PER_MINUTE       12    voice transcriptions + speech per person per minute
 *   RL_SIGNIN_FAILS_15MIN     10    failed sign-ins per username per 15 minutes
 *   RL_REGISTER_PER_HOUR       5    account creations per IP address per hour
 *   RL_DAILY_TURNS_TOTAL     900    model turns per day across everyone (protects the Groq quota)
 *
 * Counts are last-write-wins, so two requests at the same instant can undercount
 * by one. Fine for a household; not a security boundary on its own.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const FIFTEEN = 15 * MINUTE;

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const LIMITS = {
  chatPerMinute: () => num("RL_CHAT_PER_MINUTE", 10),
  chatPerDay: () => num("RL_CHAT_PER_DAY", 200),
  voicePerMinute: () => num("RL_VOICE_PER_MINUTE", 12),
  signinFails: () => num("RL_SIGNIN_FAILS_15MIN", 10),
  registerPerHour: () => num("RL_REGISTER_PER_HOUR", 5),
  dailyTurns: () => num("RL_DAILY_TURNS_TOTAL", 900),
};

export type Verdict = { allowed: true } | { allowed: false; retryAfter: number; reason: string };

type Bucket = { start: number; count: number };

const windowStart = (now: number, windowMs: number) => Math.floor(now / windowMs) * windowMs;

/** Counts one event if the bucket has room. */
async function consume(name: string, max: number, windowMs: number, reason: string): Promise<Verdict> {
  const now = Date.now();
  const start = windowStart(now, windowMs);
  return updateDoc<Bucket, Verdict>(`rl/${name}`, { start, count: 0 }, (bucket) => {
    if (bucket.start !== start) {
      bucket.start = start;
      bucket.count = 0;
    }
    if (bucket.count >= max) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((start + windowMs - now) / 1000)), reason };
    }
    bucket.count++;
    return { allowed: true };
  });
}

/** Reads a bucket without counting. Used to refuse a sign-in before checking the password. */
async function peek(name: string, max: number, windowMs: number): Promise<boolean> {
  const start = windowStart(Date.now(), windowMs);
  const bucket = await readDoc<Bucket>(`rl/${name}`, { start, count: 0 });
  return bucket.start === start && bucket.count >= max;
}

/** One model turn for the whole deployment. Stops the free quota being used up by one person. */
export async function consumeGlobalTurn(): Promise<Verdict> {
  const day = new Date().toISOString().slice(0, 10);
  return consume(`global-turns-${day}`, LIMITS.dailyTurns(), DAY, "The daily assistant budget is used up. It resets at midnight UTC.");
}

/** Checks the per-person chat limits and the shared daily budget, then counts the message. */
export async function consumeChat(username: string): Promise<Verdict> {
  const minute = await consume(`chat-min-${username}`, LIMITS.chatPerMinute(), MINUTE, "You are sending messages quickly. Wait a moment, then try again.");
  if (!minute.allowed) return minute;
  const day = await consume(`chat-day-${username}`, LIMITS.chatPerDay(), DAY, "You have reached today's message limit. It resets at midnight UTC.");
  if (!day.allowed) return day;
  return consumeGlobalTurn();
}

export async function consumeVoice(username: string): Promise<Verdict> {
  return consume(`voice-min-${username}`, LIMITS.voicePerMinute(), MINUTE, "Voice is busy. Wait a moment, then try again.");
}

export async function signinBlocked(username: string): Promise<boolean> {
  return peek(`signin-fail-${username}`, LIMITS.signinFails(), FIFTEEN);
}

export async function recordSigninFailure(username: string): Promise<void> {
  await consume(`signin-fail-${username}`, Number.MAX_SAFE_INTEGER, FIFTEEN, "");
}

export async function consumeLogin(ip: string): Promise<Verdict> {
  return consume(`login-${ip}`, 30, FIFTEEN, "Too many sign-in attempts from this network. Try again in a few minutes.");
}

export async function consumeRegister(ip: string): Promise<Verdict> {
  return consume(`register-${ip}`, LIMITS.registerPerHour(), HOUR, "Too many accounts were created from this network. Try again later.");
}

/** Best-effort client address from the proxy headers. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** A JSON 429 response with Retry-After, for routes outside eve's own chat handling. */
export function tooMany(verdict: { retryAfter: number; reason: string }): Response {
  return Response.json(
    { error: verdict.reason, retryAfter: verdict.retryAfter },
    { status: 429, headers: { "retry-after": String(verdict.retryAfter) } },
  );
}
