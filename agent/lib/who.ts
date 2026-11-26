/** The signed-in person behind a tool call. Tools never act without one. */
export function whoIsCalling(ctx: { session: { auth: { current: { principalId: string } | null } } }): string {
  const id = ctx.session.auth.current?.principalId;
  if (!id) throw new Error("Sign in to use this.");
  return id;
}
