import { Mount, Subscription, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Effect, Queue, Schema, Stream } from "effect"
import { ACCESSORIES, browPaths, moodOf, mouthPath, type Shape, skinOf } from "../domain/Face.ts"

export interface FaceOptions {
  readonly uid: string
  readonly skin: string
  readonly mood: string
  readonly talking: boolean
  readonly accessory: string | null
  readonly gaze: readonly [number, number]
  readonly blinking: boolean
}

const num = (n: number) => String(Math.round(n * 100) / 100)

const ShapeArt = <M>(h: Html.H<M>, s: Shape) => {
  switch (s.t) {
    case "path":
      return h.path.class(s.flame === true && "flame").attrs({
        d: s.d,
        fill: s.fill ?? "none",
        stroke: s.stroke ?? "none",
        "stroke-width": num(s.sw ?? 0),
        "stroke-linecap": "round",
        transform: s.transform ?? "",
        opacity: num(s.opacity ?? 1)
      })
    case "ellipse":
      return h.ellipse.attrs({
        cx: num(s.cx), cy: num(s.cy), rx: num(s.rx), ry: num(s.ry), fill: s.fill,
        stroke: s.stroke ?? "none", "stroke-width": num(s.sw ?? 0), transform: s.transform ?? ""
      })
    case "circle":
      return h.circle.attrs({ cx: num(s.cx), cy: num(s.cy), r: num(s.r), fill: s.fill })
    case "rect":
      return h.rect.attrs({ x: num(s.x), y: num(s.y), width: num(s.w), height: num(s.h), rx: num(s.rx ?? 0), fill: s.fill })
  }
}

const Eye = <M>(h: Html.H<M>, side: "l" | "r", cx: number, gaze: readonly [number, number], classes: ReadonlyArray<string | false>) =>
  h.g.class("eye", `eye-${side}`, ...classes).children(
    h.ellipse.attrs({ cx: num(cx), cy: "118", rx: "16", ry: "19", fill: "#ffffff" }),
    h.g.attrs({ transform: `translate(${num(gaze[0])} ${num(gaze[1])})` }).children(
      h.circle.attrs({ cx: num(cx), cy: "120", r: "9.5", fill: "#1d1b2e" }),
      h.circle.attrs({ cx: num(cx + 4), cy: "115", r: "3.4", fill: "#ffffff" })
    )
  )

/** Draws Juno's face. Used by the Avatar component and for the skin previews. */
export const FaceArt = <M>(h: Html.H<M>, o: FaceOptions) => {
  const m = moodOf(o.mood)
  const skin = skinOf(o.skin)
  const [browL, browR] = browPaths(m)
  const mouth = mouthPath(m)
  const gaze = m.look ?? o.gaze
  const eyeClasses: ReadonlyArray<string | false> = [o.blinking && "shut", m.eyes === "soft" && "soft", m.eyes === "wide" && "wide", m.eyes === "drowsy" && "drowsy"]
  const accessory = o.accessory ? ACCESSORIES[o.accessory] : undefined
  const skinId = `${o.uid}-skin`
  const moonId = `${o.uid}-moon`

  return h.svg
    .class("avatar-face", m.eyes === "happy" && "eyes-happy", m.eyes === "wink" && "eyes-wink", m.dots === true && "thinking", m.zzz === true && "sleepy", m.bounce === true && "bounce", o.talking && "talking")
    .attrs({ viewBox: "0 0 240 240", role: "img", "aria-label": `Juno, feeling ${o.mood}` })
    .children(
      h.defs.children(
        h.radialGradient.attrs({ id: skinId, cx: "36%", cy: "28%", r: "82%" }).children(
          h.stop.attrs({ offset: "0", "stop-color": skin.stops[0] }),
          h.stop.attrs({ offset: "0.45", "stop-color": skin.stops[1] }),
          h.stop.attrs({ offset: "1", "stop-color": skin.stops[2] })
        ),
        h.mask.attrs({ id: moonId }).children(
          h.rect.attrs({ x: "100", y: "-10", width: "60", height: "60", fill: "#ffffff" }),
          h.circle.attrs({ cx: "133", cy: "13", r: "10", fill: "#000000" })
        )
      ),
      h.ellipse.attrs({ cx: "120", cy: "228", rx: "58", ry: "7", fill: "rgba(0,0,0,0.12)" }),
      h.g.class("bob").children(
        h.g.class("tilt").attrs({ transform: `rotate(${num(m.tilt)} 120 130)` }).children(
          h.path.attrs({ d: "M120 44 Q116 30 124 20", stroke: "#8a7aa8", "stroke-width": "4", fill: "none", "stroke-linecap": "round" }),
          h.circle.attrs({ cx: "126", cy: "17", r: "11", fill: "#ffd166", mask: `url(#${moonId})` }),
          h.path.attrs({
            d: "M120 40 C178 40 210 82 210 132 C210 186 172 218 120 218 C68 218 30 186 30 132 C30 82 62 40 120 40Z",
            fill: `url(#${skinId})`
          }),
          h.ellipse.attrs({ cx: "86", cy: "80", rx: "28", ry: "14", fill: "#ffffff", opacity: "0.22", transform: "rotate(-24 86 80)" }),
          h.g.class("face").children(
            h.path.class("brow").attrs({ d: browL, stroke: "#2b2238", "stroke-width": "5", fill: "none", "stroke-linecap": "round" }),
            h.path.class("brow").attrs({ d: browR, stroke: "#2b2238", "stroke-width": "5", fill: "none", "stroke-linecap": "round" }),
            Eye(h, "l", 90, gaze, eyeClasses),
            Eye(h, "r", 150, gaze, eyeClasses),
            h.path.class("happy-eye", "happy-l").attrs({ d: "M75 122 Q90 104 105 122", stroke: "#1d1b2e", "stroke-width": "5.5", fill: "none", "stroke-linecap": "round" }),
            h.path.class("happy-eye", "happy-r").attrs({ d: "M135 122 Q150 104 165 122", stroke: "#1d1b2e", "stroke-width": "5.5", fill: "none", "stroke-linecap": "round" }),
            h.ellipse.class("cheek").attrs({ cx: "68", cy: "148", rx: "13", ry: "7.5", fill: skin.cheek, opacity: num(m.cheeks) }),
            h.ellipse.class("cheek").attrs({ cx: "172", cy: "148", rx: "13", ry: "7.5", fill: skin.cheek, opacity: num(m.cheeks) }),
            o.talking
              ? h.g.class("talk").children(
                ...[4, 10, 16].map((open, i) => {
                  const p = mouthPath(m, open)
                  return h.path.class(`talk-${i + 1}`).attrs({ d: p.d, fill: "#5b2140", stroke: "#2b2238", "stroke-width": "4.5", "stroke-linejoin": "round" })
                })
              )
              : h.path.class("mouth").attrs({
                d: mouth.d,
                fill: mouth.filled ? "#5b2140" : "none",
                stroke: "#2b2238",
                "stroke-width": "4.5",
                "stroke-linecap": "round",
                "stroke-linejoin": "round"
              })
          ),
          accessory
            ? h.g.class("accessory").attrs({ transform: accessory.transform ?? "" }).children(...accessory.shapes.map((s) => ShapeArt(h, s)))
            : false
        ),
        h.g.class("dots").attrs({ fill: "#ffffff", stroke: "#c9bfd9", "stroke-width": "2" }).children(
          h.circle.attrs({ cx: "190", cy: "58", r: "5" }),
          h.circle.attrs({ cx: "204", cy: "40", r: "7.5" }),
          h.circle.attrs({ cx: "220", cy: "18", r: "10" })
        ),
        h.g.class("zzz").children(
          h.svgText.attrs({ x: "182", y: "64" }).children("z"),
          h.svgText.attrs({ x: "200", y: "44" }).children("z")
        )
      )
    )
}

// Where the pointer or finger is, relative to the face, for its eyes to follow.
const TrackPointer = Mount.makeStream(
  "TrackPointer",
  {},
  (node: Element) =>
    Stream.callback<{ readonly x: number; readonly y: number }>(
      (queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const clamp = (n: number) => Math.round(Math.max(-5, Math.min(5, n)) * 2) / 2
            const onMove = (e: PointerEvent) => {
              const r = node.getBoundingClientRect()
              if (!r.width) return
              Queue.offerUnsafe(queue, {
                x: clamp(((e.clientX - (r.left + r.width / 2)) / r.width) * 10),
                y: clamp(((e.clientY - (r.top + r.height / 2)) / r.height) * 10)
              })
            }
            window.addEventListener("pointermove", onMove, { passive: true })
            return onMove
          }),
          (onMove) => Effect.sync(() => window.removeEventListener("pointermove", onMove))
        ),
      { bufferSize: 1, strategy: "sliding" }
    )
)

export const AvatarMessage = UiSchema.TaggedEnum({
  MovedPointer: { x: Schema.Number, y: Schema.Number },
  StartedBlink: {},
  EndedBlink: {}
})

// Blink every few seconds, at a random moment, like a person.
const blinks = Stream.forever(
  Stream.concat(
    Stream.fromEffect(Effect.suspend(() => Effect.sleep(2400 + Math.random() * 3800)).pipe(Effect.as(AvatarMessage.StartedBlink()))),
    Stream.fromEffect(Effect.sleep(130).pipe(Effect.as(AvatarMessage.EndedBlink())))
  )
)

/** Juno: an animated face whose mood, skin and accessory come from its parent. */
export const Avatar = Html.component({
  name: "Avatar",
  props: Schema.Struct({
    uid: Schema.String,
    skin: Schema.String,
    mood: Schema.String,
    talking: Schema.Boolean,
    accessory: Schema.NullOr(Schema.String)
  }),
  model: Schema.Struct({ gx: Schema.Number, gy: Schema.Number, blinking: Schema.Boolean }),
  message: AvatarMessage
}).make({
  init: () => ({ gx: 0, gy: 0, blinking: false }),
  update: {
    MovedPointer: ($, { x, y }) => ($.model.gx === x && $.model.gy === y ? $.model : $.evolve({ gx: x, gy: y })),
    StartedBlink: ($) => $.evolve({ blinking: true }),
    EndedBlink: ($) => $.evolve({ blinking: false })
  },
  subscriptions: () => [Subscription.make("blink", blinks)],
  view: (h, model) =>
    FaceArt(h, {
      uid: h.props.uid,
      skin: h.props.skin,
      mood: h.props.mood,
      talking: h.props.talking,
      accessory: h.props.accessory,
      gaze: [model.gx, model.gy],
      blinking: model.blinking
    }).onMount(TrackPointer().pipe(Mount.map(({ x, y }) => AvatarMessage.MovedPointer({ x, y }))))
})
