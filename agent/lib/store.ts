import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { get, put } from "@vercel/blob";

/**
 * Durable named documents, used for accounts ("users") and each user's
 * learning log ("scope/<memory key>").
 *
 *  - Vercel Blob when BLOB_READ_WRITE_TOKEN is set (use a PRIVATE store).
 *    One JSON file per document under docs/.
 *  - A local JSON file otherwise (.eve-data/store.json), for `eve dev`.
 *
 * Writes are last-write-wins. That is fine for a small household; two requests
 * changing the same document at the same moment can lose one update.
 */

const usingBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

// ---- local backend -------------------------------------------------------

function localPath(): string {
  return resolve(process.env.EVE_STORE_FILE ?? ".eve-data/store.json");
}

function localAll(): Record<string, unknown> {
  const path = localPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    renameSync(path, `${path}.corrupt-${Date.now()}`); // keep it for inspection
    return {};
  }
}

function localSave(all: Record<string, unknown>): void {
  const path = localPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2));
  renameSync(tmp, path);
}

// ---- Vercel Blob backend -------------------------------------------------

const blobPath = (name: string) => `docs/${name.replace(/[^a-zA-Z0-9_/-]/g, "_")}.json`;

async function blobRead<T>(name: string): Promise<T | null> {
  try {
    const result = await get(blobPath(name), { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return JSON.parse(await new Response(result.stream).text()) as T;
  } catch (error) {
    if (error instanceof Error && /not.?found|does not exist|404/i.test(`${error.name} ${error.message}`)) {
      return null;
    }
    throw error;
  }
}

async function blobWrite(name: string, value: unknown): Promise<void> {
  await put(blobPath(name), JSON.stringify(value), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
  });
}

// ---- public API ----------------------------------------------------------

export async function readDoc<T>(name: string, fallback: T): Promise<T> {
  if (usingBlob()) return (await blobRead<T>(name)) ?? structuredClone(fallback);
  const all = localAll();
  return (all[name] as T | undefined) ?? structuredClone(fallback);
}

/** Read a document, apply fn to it, and save. Returns fn's result. */
export async function updateDoc<T, R>(name: string, fallback: T, fn: (doc: T) => R | Promise<R>): Promise<R> {
  if (usingBlob()) {
    const doc = (await blobRead<T>(name)) ?? structuredClone(fallback);
    const result = await fn(doc);
    await blobWrite(name, doc);
    return result;
  }
  const all = localAll();
  const doc = (all[name] as T | undefined) ?? structuredClone(fallback);
  const result = await fn(doc);
  all[name] = doc;
  localSave(all);
  return result;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
