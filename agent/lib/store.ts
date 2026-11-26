import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * A small JSON-file store for the learning log (episodes, feedback, briefs).
 *
 * One file, written atomically (temp file, then rename). Fine for local
 * development and a demo. On an ephemeral host (for example Vercel functions)
 * this file does not persist, so swap it for a database or Vercel Blob first.
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

export type MemoryFile = { scopes: Record<string, ScopeData> };

const MAX_EPISODES = 500;
const MAX_BRIEFS = 60;
const MAX_OPS = 2000;

const emptyScope = (): ScopeData => ({ episodes: [], briefs: [], seenOperations: [] });

export function memoryPath(): string {
  return resolve(process.env.EVE_MEMORY_FILE ?? ".eve-data/learning.json");
}

function readFile(): MemoryFile {
  const path = memoryPath();
  if (!existsSync(path)) return { scopes: {} };
  try {
    return JSON.parse(readFileSync(path, "utf8")) as MemoryFile;
  } catch {
    // Keep a corrupt file for inspection instead of crashing the agent.
    renameSync(path, `${path}.corrupt-${Date.now()}`);
    return { scopes: {} };
  }
}

function writeFile(data: MemoryFile): void {
  const path = memoryPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}

export function readScope(scopeKey: string): ScopeData {
  return readFile().scopes[scopeKey] ?? emptyScope();
}

/** Read-modify-write one scope, then save. */
export function updateScope<T>(scopeKey: string, fn: (scope: ScopeData) => T): T {
  const data = readFile();
  const scope = (data.scopes[scopeKey] ??= emptyScope());
  const result = fn(scope);
  scope.episodes = scope.episodes.slice(-MAX_EPISODES);
  scope.briefs = scope.briefs.slice(-MAX_BRIEFS);
  scope.seenOperations = scope.seenOperations.slice(-MAX_OPS);
  writeFile(data);
  return result;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
