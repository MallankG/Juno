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

/** Draws Juno, the character. Used by the Avatar component and for the look previews. */
export const FaceArt = <M>(h: Html.H<M>, o: FaceOptions) => {
  const m = moodOf(o.mood)
  const skin = skinOf(o.skin)
  const [browL, browR] = browPaths(m)
  const mouth = mouthPath(m)
  const gaze = m.look ?? o.gaze
  const eyeClasses: ReadonlyArray<string | false> = [o.blinking && "shut", m.eyes === "soft" && "soft", m.eyes === "wide" && "wide", m.eyes === "drowsy" && "drowsy"]
  const accessory = o.accessory ? ACCESSORIES[o.accessory] : undefined
  const skinId = `${o.uid}-skin`
  const furId = `${o.uid}-fur`
  const [light, mid, deep] = skin.stops
  const waving = m.bounce === true || o.mood === "playful" || o.mood === "proud"

  return h.svg
    .class("avatar-face", m.eyes === "happy" && "eyes-happy", m.eyes === "wink" && "eyes-wink", m.dots === true && "thinking", m.zzz === true && "sleepy", m.bounce === true && "bounce", waving && "waving", o.talking && "talking")
    .attrs({ viewBox: "0 0 240 240", role: "img", "aria-label": `Juno, feeling ${o.mood}` })
    .children(
      h.defs.children(
        h.radialGradient.attrs({ id: skinId, cx: "38%", cy: "30%", r: "80%" }).children(
          h.stop.attrs({ offset: "0", "stop-color": light }),
          h.stop.attrs({ offset: "0.5", "stop-color": mid }),
          h.stop.attrs({ offset: "1", "stop-color": deep })
        ),
        h.linearGradient.attrs({ id: furId, x1: "0", y1: "0", x2: "0", y2: "1" }).children(
          h.stop.attrs({ offset: "0", "stop-color": mid }),
          h.stop.attrs({ offset: "1", "stop-color": deep })
        )
      ),
      h.ellipse.attrs({ cx: "120", cy: "233", rx: "50", ry: "6", fill: "rgba(0,0,0,0.13)" }),
      h.g.class("bob").children(
        // ---- body (behind the head) ----
        h.ellipse.attrs({ cx: "101", cy: "226", rx: "14", ry: "7", fill: deep }),
        h.ellipse.attrs({ cx: "139", cy: "226", rx: "14", ry: "7", fill: deep }),
        h.g.class("arm", "arm-l").children(
          h.ellipse.attrs({ cx: "79", cy: "193", rx: "10", ry: "21", fill: `url(#${furId})`, transform: "rotate(24 79 193)" })
        ),
        h.g.class("arm", "arm-r").children(
          h.ellipse.attrs({ cx: "161", cy: "193", rx: "10", ry: "21", fill: `url(#${furId})`, transform: "rotate(-24 161 193)" })
        ),
        h.path.attrs({ d: "M82 196 C82 168 158 168 158 196 C158 222 140 230 120 230 C100 230 82 222 82 196Z", fill: `url(#${skinId})` }),
        h.ellipse.attrs({ cx: "120", cy: "203", rx: "22", ry: "19", fill: "#ffffff", opacity: "0.38" }),
        // scarf
        h.path.attrs({ d: "M84 166 Q120 182 156 166 L158 176 Q120 192 82 176Z", fill: skin.accent }),
        h.path.attrs({ d: "M138 176 L150 206 L136 204 L130 180Z", fill: skin.accent }),
        h.path.attrs({ d: "M139 196 L149 199 M136 189 L146 192", stroke: "#ffffff", "stroke-width": "2", opacity: "0.5", "stroke-linecap": "round" }),
        // ---- head ----
        h.g.attrs({ transform: "translate(27 -8) scale(0.775)" }).children(
          h.g.class("tilt").attrs({ transform: `rotate(${num(m.tilt)} 120 130)` }).children(
            // ears
            h.path.attrs({ d: "M42 100 Q12 18 98 40 Q58 58 42 100Z", fill: `url(#${furId})` }),
            h.path.attrs({ d: "M50 86 Q34 36 84 46 Q60 58 50 86Z", fill: skin.cheek, opacity: "0.55" }),
            h.path.attrs({ d: "M198 100 Q228 18 142 40 Q182 58 198 100Z", fill: `url(#${furId})` }),
            h.path.attrs({ d: "M190 86 Q206 36 156 46 Q180 58 190 86Z", fill: skin.cheek, opacity: "0.55" }),
            // head
            h.path.attrs({
              d: "M120 40 C182 40 212 84 212 134 C212 188 172 216 120 216 C68 216 28 188 28 134 C28 84 58 40 120 40Z",
              fill: `url(#${skinId})`
            }),
            // muzzle and highlight
            h.ellipse.attrs({ cx: "120", cy: "160", rx: "40", ry: "26", fill: "#ffffff", opacity: "0.28" }),
            h.ellipse.attrs({ cx: "60", cy: "128", rx: "7", ry: "18", fill: "#ffffff", opacity: "0.2" }),
            // hair: a soft fringe and a curl on top
            h.path.attrs({
              d: "M58 92 C64 52 98 38 132 42 C170 46 196 70 190 98 C178 78 160 72 146 76 C150 66 142 58 134 58 C130 74 110 80 96 76 C100 68 96 62 90 60 C80 76 68 86 58 92Z",
              fill: deep
            }),
            h.path.attrs({ d: "M118 44 C108 26 122 12 136 18 C126 22 124 32 132 40", stroke: deep, "stroke-width": "7", fill: "none", "stroke-linecap": "round" }),
            h.g.class("face").children(
              h.path.class("brow").attrs({ d: browL, stroke: "#2b2238", "stroke-width": "5", fill: "none", "stroke-linecap": "round" }),
              h.path.class("brow").attrs({ d: browR, stroke: "#2b2238", "stroke-width": "5", fill: "none", "stroke-linecap": "round" }),
              Eye(h, "l", 90, gaze, eyeClasses),
              Eye(h, "r", 150, gaze, eyeClasses),
              h.path.class("happy-eye", "happy-l").attrs({ d: "M75 122 Q90 104 105 122", stroke: "#1d1b2e", "stroke-width": "5.5", fill: "none", "stroke-linecap": "round" }),
              h.path.class("happy-eye", "happy-r").attrs({ d: "M135 122 Q150 104 165 122", stroke: "#1d1b2e", "stroke-width": "5.5", fill: "none", "stroke-linecap": "round" }),
              h.ellipse.class("cheek").attrs({ cx: "66", cy: "150", rx: "13", ry: "7.5", fill: skin.cheek, opacity: num(m.cheeks) }),
              h.ellipse.class("cheek").attrs({ cx: "174", cy: "150", rx: "13", ry: "7.5", fill: skin.cheek, opacity: num(m.cheeks) }),
              // nose
              h.ellipse.attrs({ cx: "120", cy: "141", rx: "5", ry: "3.5", fill: "#2b2238", opacity: "0.75" }),
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
          )
        ),
        h.g.class("dots").attrs({ fill: "#ffffff", stroke: "#c9bfd9", "stroke-width": "2" }).children(
          h.circle.attrs({ cx: "184", cy: "46", r: "5" }),
          h.circle.attrs({ cx: "199", cy: "30", r: "7.5" }),
          h.circle.attrs({ cx: "216", cy: "10", r: "10" })
        ),
        h.g.class("zzz").children(
          h.svgText.attrs({ x: "180", y: "52" }).children("z"),
          h.svgText.attrs({ x: "198", y: "32" }).children("z")
        )
      )
    )
}

const MOOD_EMOJI: Record<string, string> = {
  neutral: "🙂", happy: "😊", excited: "🤩", celebrating: "🥳", calm: "😌", thinking: "🤔", curious: "🧐",
  concerned: "😟", empathetic: "🤗", proud: "😎", playful: "😜", sleepy: "😴", listening: "👂"
}

/** An uploaded photo in a circle. Its mood shows as a badge, since a photo can't change expression. */
export const PhotoArt = <M>(h: Html.H<M>, o: { readonly image: string; readonly mood: string; readonly talking: boolean; readonly name: string }) => {
  const m = moodOf(o.mood)
  return h.div
    .class("photo-avatar", m.dots === true && "thinking", m.bounce === true && "bounce", o.talking && "talking")
    .attrs({ role: "img", "aria-label": `${o.name}, feeling ${o.mood}` })
    .children(
      h.div.class("bob").children(
        h.img.attrs({ src: o.image, alt: "" }),
        h.span.class("mood-badge").attr("aria-hidden", "true").children(MOOD_EMOJI[o.mood] ?? "🙂"),
        h.span.class("photo-dots").attr("aria-hidden", "true").children(h.i(), h.i(), h.i())
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
    accessory: Schema.NullOr(Schema.String),
    image: Schema.NullOr(Schema.String),
    name: Schema.String
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
    h.props.image
      ? PhotoArt(h, { image: h.props.image, mood: h.props.mood, talking: h.props.talking, name: h.props.name })
      : FaceArt(h, {
      uid: h.props.uid,
      skin: h.props.skin,
      mood: h.props.mood,
      talking: h.props.talking,
      accessory: h.props.accessory,
      gaze: [model.gx, model.gy],
      blinking: model.blinking
    }).onMount(TrackPointer().pipe(Mount.map(({ x, y }) => AvatarMessage.MovedPointer({ x, y }))))
})
