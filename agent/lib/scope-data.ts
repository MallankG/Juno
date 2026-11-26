import { newId, readDoc, updateDoc } from "./store";

/**
 * The learning log for one memory scope (one user): exchanges for the nightly
 * review, feedback on suggestions, and saved briefs. Stored as "scope/<key>".
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

export type Brief = { id: string; kind: "daily" | "weekly" | "triage"; date: string; text: string; createdAt: string };

export type ScopeData = {
  episodes: Episode[];
  briefs: Brief[];
  seenOperations: string[];
};

const MAX_EPISODES = 500;
const MAX_BRIEFS = 60;
const MAX_OPS = 2000;

const emptyScope = (): ScopeData => ({ episodes: [], briefs: [], seenOperations: [] });
const docName = (scopeKey: string) => `scope/${scopeKey}`;

export async function readScope(scopeKey: string): Promise<ScopeData> {
  return readDoc(docName(scopeKey), emptyScope());
}

export async function updateScope<T>(scopeKey: string, fn: (scope: ScopeData) => T): Promise<T> {
  return updateDoc(docName(scopeKey), emptyScope(), (scope) => {
    const result = fn(scope);
    scope.episodes = scope.episodes.slice(-MAX_EPISODES);
    scope.briefs = scope.briefs.slice(-MAX_BRIEFS);
    scope.seenOperations = scope.seenOperations.slice(-MAX_OPS);
    return result;
  });
}

export { newId };
