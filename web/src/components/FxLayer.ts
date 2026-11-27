import { Component, Mount } from "@effect/ui"
import type { Html } from "@effect/ui/html"
import { Effect, Schema, Stream } from "effect"
import { createFx } from "../platform/fx.ts"

/**
 * Runs the effects engine on a canvas for as long as the canvas is shown.
 * A new burstId plays that burst once; season sets the gentle ambience.
 */
const RunEffects = Mount.make(
  "RunEffects",
  { args: { burstId: Schema.Number, effect: Schema.String, season: Schema.String } },
  (node: HTMLCanvasElement, args, changes) =>
    Effect.gen(function*() {
      const fx = yield* Effect.acquireRelease(
        Effect.sync(() => createFx(node)),
        (engine) => Effect.sync(() => engine.destroy())
      )
      let lastBurst = args.burstId
      let lastSeason = args.season
      fx.ambient(args.season)
      if (args.burstId > 0) fx.play(args.effect)
      yield* Stream.runForEach(changes, (next) =>
        Effect.sync(() => {
          if (next.season !== lastSeason) {
            lastSeason = next.season
            fx.ambient(next.season)
          }
          if (next.burstId !== lastBurst) {
            lastBurst = next.burstId
            if (next.burstId > 0) fx.play(next.effect)
          }
        }))
      return yield* Effect.never
    }).pipe(Effect.scoped, Effect.as(Component.noop))
)

/** A full-screen canvas for celebrations. Pointer events pass through it. */
export const FxLayer = <M>(h: Html.H<M>, options: { readonly burstId: number; readonly effect: string; readonly season: string }) =>
  h.canvas.class("fx").attrs({ "aria-hidden": "true" }).onMount(RunEffects(options))
