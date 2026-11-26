import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { localDev, routeAuth, withAuthChallenges } from "eve/channels/auth";

import { readDoc, updateDoc } from "./store";

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
  avatar: string; // "juno", a preset id, or "custom"
  avatarData?: string; // data URL when avatar is "custom"
  timezone: string;
  google?: { refreshToken: string; email?: string };
  push: unknown[];
  autoRules: AutoRule[];
};

type UsersDoc = { users: Record<string, User> };
const USERS = "users";
const EMPTY: UsersDoc = { users: {} };

export const USERNAME_PATTERN = /^[a-z0-9_-]{3,24}$/;

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

/** HTTP Basic sign-in against accounts. Returns the identity eve uses for the request. */
export const accountAuth = withAuthChallenges(
  async (request: Request) => {
    const header = request.headers.get("authorization") ?? "";
    if (!header.startsWith("Basic ")) return null;
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    const username = decoded.slice(0, separator).toLowerCase();
    const password = decoded.slice(separator + 1);

    let principal: string | null = null;
    if (adminMatches(username, password)) principal = username;
    else {
      const user = await findUser(username);
      if (user && (await passwordMatches(user, password))) principal = username;
    }
    if (!principal) return null;
    return {
      authenticator: "account",
      principalType: "user" as const,
      principalId: principal,
      attributes: {},
    };
  },
  [{ scheme: "Basic", parameters: { realm: "Your assistant" } }],
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

/** Creates a new account if the invite code is right. */
export async function register(username: string, password: string, inviteCode: string): Promise<User> {
  const expected = process.env.INVITE_CODE ?? "";
  if (!expected || inviteCode !== expected) throw new Error("That invite code is not valid.");
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
    avatar: user.avatar,
    avatarData: user.avatar === "custom" ? user.avatarData : undefined,
    timezone: user.timezone,
    googleConnected: Boolean(user.google?.refreshToken),
    pushSubscribed: user.push.length > 0,
    autoRules: user.autoRules,
  };
}
