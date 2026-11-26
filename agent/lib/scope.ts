import type { MemoryScopeContext } from "eve/memory";
import { byPrincipal } from "eve/memory/scope";

/**
 * Memory belongs to the signed-in person (their username). Local development
 * uses one shared scope. Anonymous callers get no memory at all.
 */
export function assistantScope(ctx: MemoryScopeContext): string | null {
  return byPrincipal(ctx);
}
