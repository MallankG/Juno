import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { localDev, routeAuth, withAuthChallenges } from "eve/channels/auth";

import { todayFor } from "./festivals";
import { readDoc, updateDoc } from "./store";
import { recordSigninFailure, signinBlocked } from "./rate-limit";

const scrypt = promisify(scryptCb) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

/**
 * Accounts for everyone who uses the assistant. Each person has their own
 * username, password, agent name and avatar, Google connection, push
 * subscriptions and automatic calendar rules. The username is the identity
 * eve uses, so each person's memory is kept separate automatically.
 */

export const DEFAULT_AGENT_NAME = "Juno";
export const DEFAULT_AVATAR = "juno";
export const DEFAULT_TIMEZONE = "America/New_York";

export type AutoRule = {
  id: string;
  title: string;
  weekday: number; // 0 = Sunday ... 6 = Saturday
  startTime: string; // "09:00"
  durationMinutes: number;
  note?: string;
};

export type User = {
  username: string;
  salt: string;
  hash: string;
  createdAt: string;
  agentName: string;
  avatar: string; // a skin id, see SKINS
  avatarData?: string; // an uploaded photo as a small data URL (see AVATAR_IMAGE)
  timezone: string;
  birthday?: string; // "MM-DD"
  google?: { refreshToken: string; email?: string };
  push: unknown[];
  autoRules: AutoRule[];
};

type UsersDoc = { users: Record<string, User> };
const USERS = "users";
const EMPTY: UsersDoc = { users: {} };

export const USERNAME_PATTERN = /^[a-z0-9_-]{3,24}$/;

/** Colour skins for Juno's character. Older avatar ids map onto these. */
export const SKINS = ["juno", "mint", "ocean", "sunset", "midnight", "rose"] as const;
const LEGACY_SKINS: Record<string, string> = {
  "orb-ember": "sunset", "orb-ocean": "ocean", "orb-moss": "mint", "orb-dusk": "midnight", "orb-sand": "rose", custom: "juno",
};
/**
 * Uploaded avatar photos: the app crops them to a 256px square and sends a
 * data URL. Only PNG, JPEG and WebP are accepted, up to about 150 KB.
 */
export const AVATAR_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
export const AVATAR_IMAGE_MAX = 200_000;

export const skinOf = (avatar: string) =>
  (SKINS as readonly string[]).includes(avatar) ? avatar : LEGACY_SKINS[avatar] ?? "juno";

async function hashPassword(password: string, salt: string): Promise<string> {
  return (await scrypt(password, salt, 64)).toString("hex");
}

export async function createUser(username: string, password: string): Promise<User> {
  const salt = randomBytes(16).toString("hex");
  const user: User = {
    username,
    salt,
    hash: await hashPassword(password, salt),
    createdAt: new Date().toISOString(),
    agentName: DEFAULT_AGENT_NAME,
    avatar: DEFAULT_AVATAR,
    timezone: DEFAULT_TIMEZONE,
    push: [],
    autoRules: [],
  };
  return updateDoc<UsersDoc, User>(USERS, EMPTY, (doc) => {
    if (doc.users[username]) throw new Error("That username is taken.");
    doc.users[username] = user;
    return user;
  });
}

export async function findUser(username: string): Promise<User | undefined> {
  const doc = await readDoc<UsersDoc>(USERS, EMPTY);
  return doc.users[username];
}

/** Returns the user, creating a profile for the local development identity on first use. */
export async function ensureUser(username: string): Promise<User> {
  const existing = await findUser(username);
  if (existing) return existing;
  return updateDoc<UsersDoc, User>(USERS, EMPTY, (doc) => {
    const user: User = doc.users[username] ?? {
      username,
      salt: "",
      hash: "",
      createdAt: new Date().toISOString(),
      agentName: DEFAULT_AGENT_NAME,
      avatar: DEFAULT_AVATAR,
      timezone: DEFAULT_TIMEZONE,
      push: [],
      autoRules: [],
    };
    doc.users[username] = user;
    return user;
  });
}

export async function updateUser<R>(username: string, fn: (user: User) => R): Promise<R> {
  await ensureUser(username);
  return updateDoc<UsersDoc, R>(USERS, EMPTY, (doc) => {
    const user = doc.users[username];
    if (!user) throw new Error("No such account.");
    return fn(user);
  });
}

export async function listUsers(): Promise<User[]> {
  const doc = await readDoc<UsersDoc>(USERS, EMPTY);
  return Object.values(doc.users);
}

async function passwordMatches(user: User, password: string): Promise<boolean> {
  if (!user.salt || !user.hash) return false;
  const candidate = Buffer.from(await hashPassword(password, user.salt), "hex");
  const expected = Buffer.from(user.hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/** Optional admin login from environment variables, kept for the first deployment. */
function adminMatches(username: string, password: string): boolean {
  const admin = process.env.ASSISTANT_USERNAME;
  const adminPassword = process.env.ASSISTANT_PASSWORD;
  if (!admin || !adminPassword) return false;
  return username === admin && password === adminPassword;
}

// ---- session tokens -------------------------------------------------------
//
// The phone app signs in once with a username and password and receives a
// signed token (valid 30 days). The app sends it as "Authorization: Bearer".
// Using Bearer, not HTTP Basic, means browsers never show their own password
// pop-up. Changing AUTH_SECRET signs everyone out.

const TOKEN_DAYS = 30;

function authSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.CRON_SECRET || "";
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "juno-local-development-only";
  throw new Error("AUTH_SECRET is not set, so sign-in is turned off.");
}

const sign = (payload: string) => createHmac("sha256", authSecret()).update(payload).digest("base64url");

export function issueToken(username: string): string {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + TOKEN_DAYS * 86_400_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string): string | null {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  let expected: Buffer;
  try {
    expected = Buffer.from(sign(payload));
  } catch {
    return null;
  }
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u: string; exp: number };
    return typeof u === "string" && exp > Date.now() ? u : null;
  } catch {
    return null;
  }
}

/** Checks a username and password. Counts failures, and refuses for a while after too many. */
export async function checkPassword(rawUsername: string, password: string): Promise<string | null> {
  const username = rawUsername.trim().toLowerCase();
  if (!username || (await signinBlocked(username))) return null;
  if (adminMatches(username, password)) {
    await ensureUser(username);
    return username;
  }
  const user = await findUser(username);
  if (user && (await passwordMatches(user, password))) return username;
  await recordSigninFailure(username);
  return null;
}

const principal = (username: string) => ({
  authenticator: "account",
  principalType: "user" as const,
  principalId: username,
  attributes: {},
});

/**
 * Sign-in for every API route. Accepts the app's Bearer token, and HTTP Basic
 * for scripts. Its 401 advertises Bearer only, so browsers never pop up a
 * password dialog.
 */
export const accountAuth = withAuthChallenges(
  async (request: Request) => {
    const header = request.headers.get("authorization") ?? "";
    if (header.startsWith("Bearer ")) {
      const username = verifyToken(header.slice(7).trim());
      return username ? principal(username) : null;
    }
    if (header.startsWith("Basic ")) {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      if (separator < 0) return null;
      const username = await checkPassword(decoded.slice(0, separator), decoded.slice(separator + 1));
      return username ? principal(username) : null;
    }
    return null;
  },
  [{ scheme: "Bearer" }],
);

/**
 * Checks a request. Returns the username, or a 401 response to send back.
 * Local development requests are always allowed (as local development identity).
 */
export async function authenticate(
  request: Request,
): Promise<{ username: string } | { response: Response }> {
  const result = await routeAuth(request, [accountAuth, localDev()]);
  if (result instanceof Response) return { response: result };
  return { username: result.principalId };
}

/**
 * Invite codes are switched on with INVITE_REQUIRED=on (or true/1/yes) and
 * need INVITE_CODE to be set too. Off by default: anyone can sign up.
 */
export const inviteRequired = () =>
  /^(on|true|1|yes)$/i.test((process.env.INVITE_REQUIRED ?? "").trim()) && Boolean(process.env.INVITE_CODE);

/** Creates a new account. Needs the invite code when invites are switched on. */

export async function register(username: string, password: string, inviteCode: string): Promise<User> {
  const expected = inviteRequired() ? (process.env.INVITE_CODE ?? "") : "";
  if (expected && inviteCode.trim() !== expected) throw new Error("That invite code is not valid.");
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error("Use 3 to 24 letters, numbers, dashes or underscores for the username.");
  }
  if (password.length < 8) throw new Error("Use a password of at least 8 characters.");
  return createUser(username, password);
}

export function publicProfile(user: User) {
  return {
    username: user.username,
    agentName: user.agentName,
    avatar: skinOf(user.avatar),
    avatarImage: user.avatarData && AVATAR_IMAGE.test(user.avatarData) ? user.avatarData : null,
    timezone: user.timezone,
    birthday: user.birthday ?? null,
    googleConnected: Boolean(user.google?.refreshToken),
    pushSubscribed: user.push.length > 0,
    autoRules: user.autoRules,
    today: todayFor(user.timezone, user.birthday, user.createdAt),
  };
}
