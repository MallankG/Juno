import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { get, put } from "@vercel/blob";

/**
 * Durable named documents, used for accounts ("users") and each user's
 * learning log ("scope/<memory key>").
 *
 *  - Vercel Blob when BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID is set (a PRIVATE store).
 *    One JSON file per document under docs/.
 *  - A local JSON file otherwise (.eve-data/store.json), for `eve dev`.
 *
 * Writes are last-write-wins. That is fine for a small household; two requests
 * changing the same document at the same moment can lose one update.
 */

/**
 * Blob is used when a token is set, or when the project is connected to a Blob
 * store (BLOB_STORE_ID): on Vercel the SDK then signs in with the deployment's
 * own OIDC identity, so no token is needed.
 */
const usingBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

// ---- local backend -------------------------------------------------------

function localPath(): string {
  if (process.env.EVE_STORE_FILE) return resolve(process.env.EVE_STORE_FILE);
  // Serverless hosts have a read-only app directory. /tmp is writable but is
  // wiped between instances, so this is only a last resort: connect Blob.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    if (!warnedEphemeral) {
      warnedEphemeral = true;
      console.warn("[juno] No Blob store connected: data is kept in /tmp and will be lost. Connect a Blob store.");
    }
    return "/tmp/.eve-data/store.json";
  }
  return resolve(".eve-data/store.json");
}

let warnedEphemeral = false;

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
