/**
 * Juno's face as data: colour skins, moods (brows, eyes, mouth, cheeks, tilt,
 * gaze) and festive accessories. The Avatar component draws these.
 */

export interface Skin {
  readonly stops: readonly [string, string, string]
  readonly cheek: string
  readonly glow: string
  readonly accent: string
  readonly label: string
}

export const SKINS: Record<string, Skin> = {
  juno: { stops: ["#ffe2b8", "#ff9a6b", "#7c4ddb"], cheek: "#ff6b9a", glow: "rgba(255,154,107,.35)", accent: "#7c4ddb", label: "Juno" },
  mint: { stops: ["#eafff4", "#7fdcb0", "#1f8a70"], cheek: "#ff8fa3", glow: "rgba(127,220,176,.35)", accent: "#1f8a70", label: "Mint" },
  ocean: { stops: ["#e0f7ff", "#5cc8f0", "#2357c9"], cheek: "#ff8fb1", glow: "rgba(92,200,240,.35)", accent: "#2357c9", label: "Ocean" },
  sunset: { stops: ["#fff1c1", "#ffa94d", "#e2483d"], cheek: "#ff5d73", glow: "rgba(255,169,77,.38)", accent: "#e2483d", label: "Sunset" },
  midnight: { stops: ["#d3dcff", "#7a6cff", "#2b2165"], cheek: "#ff86c8", glow: "rgba(122,108,255,.35)", accent: "#6c5ce7", label: "Midnight" },
  rose: { stops: ["#ffe4ef", "#ff8fb8", "#b83280"], cheek: "#ff4f8b", glow: "rgba(255,143,184,.35)", accent: "#b83280", label: "Rose" }
}
export const SKIN_IDS = Object.keys(SKINS)
export const skinOf = (id: string): Skin => SKINS[id] ?? SKINS.juno!

export type Eyes = "open" | "happy" | "soft" | "wide" | "wink" | "drowsy"

export interface MoodShape {
  readonly lift: number // brows up
  readonly angle: number // inner brow up (worried) or down (cross)
  readonly smile: number // mouth curve; negative frowns
  readonly open: number // mouth opening
  readonly width: number
  readonly skew: number
  readonly eyes: Eyes
  readonly cheeks: number
  readonly tilt: number
  readonly look: readonly [number, number] | null
  readonly dots?: boolean
  readonly zzz?: boolean
  readonly bounce?: boolean
}

export const MOODS: Record<string, MoodShape> = {
  neutral: { lift: 0, angle: 0, smile: 7, open: 0, width: 1, skew: 0, eyes: "open", cheeks: 0.25, tilt: 0, look: null },
  happy: { lift: 3, angle: -1, smile: 14, open: 5, width: 1, skew: 0, eyes: "open", cheeks: 0.55, tilt: 0, look: null },
  excited: { lift: 6, angle: 0, smile: 15, open: 13, width: 1.05, skew: 0, eyes: "happy", cheeks: 0.8, tilt: 0, look: null, bounce: true },
  celebrating: { lift: 6, angle: 0, smile: 16, open: 14, width: 1.1, skew: 0, eyes: "happy", cheeks: 0.85, tilt: 0, look: null, bounce: true },
  calm: { lift: 0, angle: 0, smile: 8, open: 0, width: 0.9, skew: 0, eyes: "soft", cheeks: 0.35, tilt: 0, look: null },
  thinking: { lift: 3, angle: 4, smile: 2, open: 0, width: 0.6, skew: 6, eyes: "open", cheeks: 0.2, tilt: -5, look: [5, -6], dots: true },
  curious: { lift: 7, angle: 2, smile: 0, open: 8, width: 0.45, skew: 0, eyes: "wide", cheeks: 0.3, tilt: 8, look: [3, -2] },
  concerned: { lift: 2, angle: 8, smile: -5, open: 0, width: 0.8, skew: 0, eyes: "open", cheeks: 0.15, tilt: 0, look: [0, 2] },
  empathetic: { lift: 2, angle: 6, smile: 5, open: 0, width: 0.8, skew: 0, eyes: "soft", cheeks: 0.45, tilt: -6, look: [0, 1] },
  proud: { lift: 4, angle: -2, smile: 14, open: 3, width: 1, skew: 0, eyes: "happy", cheeks: 0.6, tilt: 3, look: null },
  playful: { lift: 4, angle: -3, smile: 12, open: 3, width: 0.9, skew: 5, eyes: "wink", cheeks: 0.55, tilt: 6, look: null },
  sleepy: { lift: -1, angle: 0, smile: 0, open: 5, width: 0.4, skew: 0, eyes: "drowsy", cheeks: 0.25, tilt: -4, look: [0, 3], zzz: true },
  listening: { lift: 5, angle: 1, smile: 9, open: 0, width: 0.9, skew: 0, eyes: "wide", cheeks: 0.4, tilt: 4, look: null }
}
export const moodOf = (id: string): MoodShape => MOODS[id] ?? MOODS.neutral!
export const isMood = (id: string): boolean => id in MOODS

export const browPaths = (m: MoodShape): readonly [string, string] => {
  const y = 92 - m.lift
  return [
    `M74 ${y + 2} Q89 ${y - 6 - m.angle / 2} 104 ${y - m.angle}`,
    `M136 ${y - m.angle} Q151 ${y - 6 - m.angle / 2} 166 ${y + 2}`
  ]
}

/** The mouth for a mood, and whether it's open (filled). */
export const mouthPath = (m: MoodShape, open = m.open): { readonly d: string; readonly filled: boolean } => {
  const cx = 120 + m.skew
  const y = 154
  const w = 17 * m.width
  if (open < 1.2) return { d: `M${cx - w} ${y} Q${cx} ${y + m.smile} ${cx + w} ${y}`, filled: false }
  const top = y + m.smile * 0.2 - open * 0.15
  const bottom = y + m.smile * 0.6 + open
  return { d: `M${cx - w} ${y} Q${cx} ${top} ${cx + w} ${y} Q${cx} ${bottom} ${cx - w} ${y}Z`, filled: true }
}

// ---- accessories -------------------------------------------------------------

export type Shape =
  | { readonly t: "path"; readonly d: string; readonly fill?: string; readonly stroke?: string; readonly sw?: number; readonly transform?: string; readonly flame?: boolean; readonly opacity?: number }
  | { readonly t: "ellipse"; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number; readonly fill: string; readonly stroke?: string; readonly sw?: number; readonly transform?: string }
  | { readonly t: "circle"; readonly cx: number; readonly cy: number; readonly r: number; readonly fill: string }
  | { readonly t: "rect"; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rx?: number; readonly fill: string }

export interface Accessory {
  readonly transform?: string
  readonly shapes: ReadonlyArray<Shape>
}

const HEART = "M0 6C0-2 12-2 12 6c0 6-12 12-12 16 0-4-12-10-12-16 0-8 12-8 12 0z"
const STAR4 = "M0-12 3-3 12 0 3 3 0 12-3 3-12 0-3-3Z"
const STAR5 = "M0-10 2.9-3.1 10.5-3.1 4.3 1.2 6.6 8.5 0 4 -6.6 8.5 -4.3 1.2 -10.5-3.1 -2.9-3.1Z"

export const ACCESSORIES: Record<string, Accessory> = {
  "party-hat": {
    transform: "translate(152 30) rotate(20)",
    shapes: [
      { t: "path", d: "M0 -6 L-22 46 L22 46 Z", fill: "#ff5d8f" },
      { t: "path", d: "M-12 22 L12 22 M-17 34 L17 34", stroke: "#ffe066", sw: 5, fill: "none" },
      { t: "circle", cx: 0, cy: -8, r: 7, fill: "#ffe066" }
    ]
  },
  "santa-hat": {
    transform: "translate(140 30) rotate(14)",
    shapes: [
      { t: "path", d: "M-36 30 Q-10 -26 34 -4 Q24 12 36 30 Z", fill: "#e63946" },
      { t: "rect", x: -42, y: 24, w: 84, h: 16, rx: 8, fill: "#ffffff" },
      { t: "circle", cx: 35, cy: -4, r: 9, fill: "#ffffff" }
    ]
  },
  "witch-hat": {
    transform: "translate(124 28) rotate(8)",
    shapes: [
      { t: "ellipse", cx: 0, cy: 26, rx: 54, ry: 10, fill: "#3d2c5e" },
      { t: "path", d: "M-27 26 Q2 -10 14 -44 Q16 -6 28 26 Z", fill: "#4b3577" },
      { t: "rect", x: -25, y: 14, w: 51, h: 8, fill: "#f4a261" }
    ]
  },
  heart: {
    shapes: [
      { t: "path", d: HEART, fill: "#ff4d6d", transform: "translate(186 44) scale(1.25)" },
      { t: "path", d: HEART, fill: "#ff4d6d", opacity: 0.8, transform: "translate(204 18) scale(.7)" }
    ]
  },
  "leaf-crown": {
    shapes: ([[62, 70, -50, "#e76f51"], [80, 54, -30, "#f4a261"], [100, 46, -10, "#e9c46a"], [140, 46, 10, "#e76f51"], [160, 54, 30, "#f4a261"], [178, 70, 50, "#e9c46a"]] as const).map(
      ([x, y, r, c]): Shape => ({ t: "ellipse", cx: x, cy: y, rx: 8, ry: 15, fill: c, transform: `rotate(${r} ${x} ${y})` })
    )
  },
  diya: {
    transform: "translate(192 198)",
    shapes: [
      { t: "path", d: "M-24 0 Q0 24 24 0 Z", fill: "#c2410c" },
      { t: "path", d: "M-24 0 L24 0", stroke: "#fb923c", sw: 4, fill: "none" },
      { t: "path", d: "M0 -4 Q-8 -16 0 -30 Q8 -16 0 -4Z", fill: "#ffb703", flame: true }
    ]
  },
  lantern: {
    transform: "translate(200 58)",
    shapes: [
      { t: "path", d: "M0 -34 L0 -10", stroke: "#b91c1c", sw: 3, fill: "none" },
      { t: "ellipse", cx: 0, cy: 8, rx: 16, ry: 18, fill: "#dc2626" },
      { t: "rect", x: -9, y: -13, w: 18, h: 6, rx: 2, fill: "#fbbf24" },
      { t: "rect", x: -9, y: 23, w: 18, h: 6, rx: 2, fill: "#fbbf24" },
      { t: "path", d: "M-6 30 v8 M0 30 v10 M6 30 v8", stroke: "#fbbf24", sw: 2, fill: "none" }
    ]
  },
  "crescent-star": { shapes: [{ t: "path", d: STAR5, fill: "#ffd166", transform: "translate(150 14)" }] },
  shamrock: {
    transform: "translate(176 52)",
    shapes: [
      { t: "circle", cx: 0, cy: -9, r: 8, fill: "#2a9d55" },
      { t: "circle", cx: -8, cy: 2, r: 8, fill: "#2a9d55" },
      { t: "circle", cx: 8, cy: 2, r: 8, fill: "#2a9d55" },
      { t: "path", d: "M0 4 Q4 16 10 22", stroke: "#2a9d55", sw: 3, fill: "none" }
    ]
  },
  "flower-crown": {
    shapes: ([[66, 66, "#ff8fab"], [86, 52, "#ffd166"], [106, 45, "#cdb4db"], [134, 45, "#ff8fab"], [154, 52, "#ffd166"], [174, 66, "#cdb4db"]] as const).flatMap(
      ([x, y, c]): Array<Shape> => [{ t: "circle", cx: x, cy: y, r: 8, fill: c }, { t: "circle", cx: x, cy: y, r: 3, fill: "#fff8e1" }]
    )
  },
  sparkles: {
    shapes: ([[38, 62, 1], [204, 74, 0.8], [46, 196, 0.7], [200, 186, 1]] as const).map(
      ([x, y, s]): Shape => ({ t: "path", d: STAR4, fill: "#ffd166", transform: `translate(${x} ${y}) scale(${s})` })
    )
  },
  "bunny-ears": {
    shapes: [
      { t: "ellipse", cx: 94, cy: 28, rx: 12, ry: 32, fill: "#ffffff", stroke: "#f5c2d6", sw: 3, transform: "rotate(-12 94 28)" },
      { t: "ellipse", cx: 94, cy: 30, rx: 5, ry: 20, fill: "#ffc2dc", transform: "rotate(-12 94 30)" },
      { t: "ellipse", cx: 146, cy: 28, rx: 12, ry: 32, fill: "#ffffff", stroke: "#f5c2d6", sw: 3, transform: "rotate(12 146 28)" },
      { t: "ellipse", cx: 146, cy: 30, rx: 5, ry: 20, fill: "#ffc2dc", transform: "rotate(12 146 30)" }
    ]
  }
}
