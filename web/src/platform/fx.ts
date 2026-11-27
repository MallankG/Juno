/**
 * Celebration effects drawn on a canvas: confetti, fireworks, hearts, snow,
 * leaves and sparkles, plus a gentle seasonal ambience. The FxLayer mount
 * drives this engine from the Model.
 */

type Shape = "rect" | "circle" | "heart" | "star" | "leaf" | "flake"

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  g: number
  drag: number
  size: number
  shape: Shape
  color: string
  rot: number
  vr: number
  life: number
  decay: number
  sway: number
  seed: number
  alpha: number
}

export interface FxEngine {
  readonly play: (effect: string) => void
  readonly ambient: (season: string) => void
  readonly destroy: () => void
}

const COLORS = ["#ff5d8f", "#ffd166", "#06d6a0", "#118ab2", "#a98bff", "#ff9a6b"]
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <A>(xs: ReadonlyArray<A>): A => xs[Math.floor(Math.random() * xs.length)] as A

export const createFx = (canvas: HTMLCanvasElement): FxEngine => {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches
  const ctx = canvas.getContext("2d")
  let W = 0
  let H = 0
  let parts: Array<Particle> = []
  let ambient: { max: number; rate: number; spawn: () => void } | null = null
  let frame = 0
  let running = false

  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1)
    W = innerWidth
    H = innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  addEventListener("resize", resize)
  resize()

  const add = (p: Partial<Particle> & Pick<Particle, "x" | "y" | "shape" | "color" | "size">) =>
    parts.push({ vx: 0, vy: 0, g: 0, drag: 0.99, rot: 0, vr: 0, life: 1, decay: 0.004, sway: 0, seed: rnd(0, 99), alpha: 1, ...p })

  const heart = (c: CanvasRenderingContext2D, s: number) => {
    c.beginPath()
    c.moveTo(0, s * 0.3)
    c.bezierCurveTo(0, 0, -s * 0.5, 0, -s * 0.5, s * 0.3)
    c.bezierCurveTo(-s * 0.5, s * 0.6, 0, s * 0.8, 0, s)
    c.bezierCurveTo(0, s * 0.8, s * 0.5, s * 0.6, s * 0.5, s * 0.3)
    c.bezierCurveTo(s * 0.5, 0, 0, 0, 0, s * 0.3)
    c.fill()
  }
  const star = (c: CanvasRenderingContext2D, s: number) => {
    c.beginPath()
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? s * 0.3 : s
      const a = (i * Math.PI) / 4
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    c.closePath()
    c.fill()
  }

  const loop = () => {
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    if (ambient && parts.length < ambient.max && Math.random() < ambient.rate) ambient.spawn()
    parts = parts.filter((p) => p.life > 0 && p.y < H + 40 && p.y > -120)
    for (const p of parts) {
      p.vx *= p.drag
      p.vy = p.vy * p.drag + p.g
      p.x += p.vx + Math.sin((p.y + p.seed) / 30) * p.sway
      p.y += p.vy
      p.rot += p.vr
      p.life -= p.decay
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5)) * p.alpha
      ctx.fillStyle = p.color
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      if (p.shape === "rect") ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      else if (p.shape === "heart") heart(ctx, p.size)
      else if (p.shape === "star") star(ctx, p.size)
      else if (p.shape === "leaf") {
        ctx.beginPath()
        ctx.ellipse(0, 0, p.size * 0.45, p.size, 0, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.arc(0, 0, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
    ctx.globalAlpha = 1
    if (parts.length || ambient) frame = requestAnimationFrame(loop)
    else {
      running = false
      ctx.clearRect(0, 0, W, H)
    }
  }
  const kick = () => {
    if (!running) {
      running = true
      frame = requestAnimationFrame(loop)
    }
  }

  // Bursts start from the character, which sits in the upper middle.
  const origin = (): [number, number] => {
    const face = document.querySelector(".avatar-face")
    if (face) {
      const r = face.getBoundingClientRect()
      return [r.left + r.width / 2, r.top + r.height / 2]
    }
    return [W / 2, H * 0.32]
  }

  const effects: Record<string, () => void> = {
    confetti: () => {
      const [cx, cy] = origin()
      for (let i = 0; i < 140; i++) {
        add({ x: cx, y: cy, vx: rnd(-9, 9), vy: rnd(-14, -4), g: 0.32, drag: 0.985, size: rnd(7, 12), shape: "rect", color: pick(COLORS), vr: rnd(-0.3, 0.3), decay: rnd(0.004, 0.008) })
      }
    },
    fireworks: () => {
      for (let b = 0; b < 4; b++) {
        setTimeout(() => {
          const x = rnd(W * 0.15, W * 0.85)
          const y = rnd(H * 0.12, H * 0.4)
          const color = pick(COLORS)
          for (let i = 0; i < 60; i++) {
            const a = (i / 60) * Math.PI * 2
            const s = rnd(2, 6.5)
            add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.06, drag: 0.975, size: rnd(1.6, 3), shape: "circle", color, decay: rnd(0.012, 0.02) })
          }
          kick()
        }, b * 380)
      }
    },
    hearts: () => {
      for (let i = 0; i < 32; i++) {
        add({ x: rnd(0, W), y: H + rnd(0, 120), vx: rnd(-0.4, 0.4), vy: rnd(-3.2, -1.6), size: rnd(12, 24), shape: "heart", color: pick(["#ff4d6d", "#ff8fab", "#ffb3c6"]), decay: 0.003, sway: 0.6 })
      }
    },
    snow: () => {
      for (let i = 0; i < 70; i++) {
        add({ x: rnd(0, W), y: rnd(-H * 0.6, 0), vy: rnd(0.6, 1.6), size: rnd(1.6, 4), shape: "flake", color: "#ffffff", alpha: 0.9, decay: 0.0015, sway: 0.5 })
      }
    },
    leaves: () => {
      for (let i = 0; i < 34; i++) {
        add({ x: rnd(0, W), y: rnd(-H * 0.5, 0), vy: rnd(0.8, 1.8), size: rnd(6, 11), shape: "leaf", color: pick(["#e76f51", "#f4a261", "#e9c46a", "#bc6c25"]), vr: rnd(-0.05, 0.05), decay: 0.0018, sway: 1.1 })
      }
    },
    sparkles: () => {
      const [cx, cy] = origin()
      for (let i = 0; i < 26; i++) {
        add({ x: cx + rnd(-140, 140), y: cy + rnd(-130, 110), vy: rnd(-0.6, -0.2), size: rnd(4, 9), shape: "star", color: pick(["#ffd166", "#fff3b0", "#a98bff"]), decay: rnd(0.008, 0.014) })
      }
    }
  }

  return {
    play: (effect) => {
      if (reduceMotion) return
      const run = effects[effect]
      if (!run) return
      run()
      kick()
    },
    ambient: (season) => {
      ambient = null
      if (reduceMotion) return
      if (season === "winter") {
        ambient = { max: 22, rate: 0.05, spawn: () => add({ x: rnd(0, W), y: -10, vy: rnd(0.4, 1), size: rnd(1.2, 3), shape: "flake", color: "#ffffff", alpha: 0.75, decay: 0, sway: 0.4 }) }
      } else if (season === "autumn") {
        ambient = { max: 7, rate: 0.012, spawn: () => add({ x: rnd(0, W), y: -10, vy: rnd(0.6, 1.2), size: rnd(5, 9), shape: "leaf", color: pick(["#e76f51", "#f4a261", "#e9c46a"]), alpha: 0.8, vr: rnd(-0.04, 0.04), decay: 0, sway: 1 }) }
      } else if (season === "spring") {
        ambient = { max: 8, rate: 0.012, spawn: () => add({ x: rnd(0, W), y: -10, vy: rnd(0.5, 1), size: rnd(4, 6), shape: "leaf", color: pick(["#ffc8dd", "#ffafcc", "#fde2e4"]), alpha: 0.85, vr: rnd(-0.05, 0.05), decay: 0, sway: 0.9 }) }
      }
      if (ambient) kick()
    },
    destroy: () => {
      cancelAnimationFrame(frame)
      removeEventListener("resize", resize)
      parts = []
      ambient = null
    }
  }
}
