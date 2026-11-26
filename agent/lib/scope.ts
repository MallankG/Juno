import type { MemoryScopeContext } from "eve/memory";
import { byPrincipal } from "eve/memory/scope";
import { isScheduleAuth } from "eve/schedules";

/**
 * Who owns the memory.
 *
 * A signed-in person gets their own memory (`byPrincipal`). Scheduled runs
 * (the morning brief, nightly review) run as the app, not as a person, so
 * `byPrincipal` would turn their memory off. They are mapped to the owner
 * instead, so the brief can read what the assistant knows about its user.
 *
 * Set ASSISTANT_OWNER_ID to a stable id (defaults to "owner"). In local
 * development, `byPrincipal` already gives one shared scope.
 */
export const OWNER_SCOPE = process.env.ASSISTANT_OWNER_ID ?? "owner";

export function assistantScope(ctx: MemoryScopeContext): string | null {
  if (isScheduleAuth(ctx.session.auth.current)) return OWNER_SCOPE;
  return byPrincipal(ctx);
}
