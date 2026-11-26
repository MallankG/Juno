import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { get, put } from "@vercel/blob";

/**
 * Durable storage for the learning log (episodes, feedback, briefs).
 *
 * Two backends, chosen by environment:
 *  - Vercel Blob when BLOB_READ_WRITE_TOKEN is set (use a PRIVATE Blob store).
 *    One small JSON document per memory scope: learning/<scope>.json.
 *    Works on Vercel, where local files do not survive between requests.
 *  - A local JSON file otherwise (.eve-data/learning.json), for `eve dev`.
 *
 * Writes are last-write-wins. That is fine for one person's assistant; if two
 * requests change the same scope at the same moment, one update can be lost.
 */

export type Episode = {
  id: string;
  at: string;
  kind: "exchange" | "feedback";
  user?: string;
  assistant?: string;
  outcome?: "accepted" | "rejected" | "corrected";
  subject?: string;
  correction?: string;
};

export type Brief = { id: string; date: string; text: string; createdAt: string };

export type ScopeData = {
  episodes: Episode[];
  briefs: Brief[];
  seenOperations: string[];
};

const MAX_EPISODES = 500;
const MAX_BRIEFS = 60;
const MAX_OPS = 2000;

const emptyScope = (): ScopeData => ({ episodes: [], briefs: [], seenOperations: [] });

const usingBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

// ---- local file backend -------------------------------------------------

function localPath(): string {
  return resolve(process.env.EVE_MEMORY_FILE ?? ".eve-data/learning.json");
}

function localRead(): Record<string, ScopeData> {
  const path = localPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, ScopeData>;
  } catch {
    // Keep a corrupt file for inspection instead of crashing the agent.
    renameSync(path, `${path}.corrupt-${Date.now()}`);
    return {};
  }
}

function localWrite(all: Record<string, ScopeData>): void {
  const path = localPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2));
  renameSync(tmp, path);
}

// ---- Vercel Blob backend ------------------------------------------------

const blobPath = (scopeKey: string) => `learning/${scopeKey.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;

async function blobRead(scopeKey: string): Promise<ScopeData | null> {
  try {
    const result = await get(blobPath(scopeKey), { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as ScopeData;
  } catch (error) {
    // A scope with no data yet is a normal state, not an error.
    if (error instanceof Error && /not.?found|does not exist|404/i.test(`${error.name} ${error.message}`)) {
      return null;
    }
    throw error;
  }
}

async function blobWrite(scopeKey: string, data: ScopeData): Promise<void> {
  await put(blobPath(scopeKey), JSON.stringify(data), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
  });
}

// ---- public API ----------------------------------------------------------

export async function readScope(scopeKey: string): Promise<ScopeData> {
  if (usingBlob()) return (await blobRead(scopeKey)) ?? emptyScope();
  return localRead()[scopeKey] ?? emptyScope();
}

/** Read one scope, apply fn, trim, and save. Returns fn's result. */
export async function updateScope<T>(scopeKey: string, fn: (scope: ScopeData) => T): Promise<T> {
  let scope: ScopeData;
  let all: Record<string, ScopeData> | undefined;
  if (usingBlob()) {
    scope = (await blobRead(scopeKey)) ?? emptyScope();
  } else {
    all = localRead();
    scope = all[scopeKey] ?? emptyScope();
  }

  const result = fn(scope);
  scope.episodes = scope.episodes.slice(-MAX_EPISODES);
  scope.briefs = scope.briefs.slice(-MAX_BRIEFS);
  scope.seenOperations = scope.seenOperations.slice(-MAX_OPS);

  if (usingBlob()) {
    await blobWrite(scopeKey, scope);
  } else {
    all![scopeKey] = scope;
    localWrite(all!);
  }
  return result;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
