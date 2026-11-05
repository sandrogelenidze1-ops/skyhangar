// SkyHangarSkylineSpec.ts
// Owns: the PURE (no Lens globals) description of the distant skyline: where each tower stands, how big it is, and its painted facade atlas.
// Runs unchanged under Node for fast checks (see Tests/Leaf/SkylineChecks.ts). Deterministic: fixed seed, no Math.random, no time.
// Must not: create scene objects, materials or textures (SkyHangarSkyline.ts does that).

const DEG = Math.PI / 180

export const SKY_COUNT = 16 // towers in the ring
export const SKY_DIST = 5325 // cm from the viewer. The sky dome is at 6000 and the nearest existing buildings (ring C) end at ~4870, so this is the gap between them.
export const SKY_DIST_JITTER = 150 // total spread of the distance, cm
export const SKY_BASE = -600 // cm below eye level (the roof parapet already hides everything below about -2 degrees)
export const SKY_MIN_TOP_EL = 2.6 // lowest tower top, degrees above the horizon
export const SKY_MAX_TOP_EL = 6.8 // tallest tower body, degrees
export const SKY_FRONT_MAX_EL = 3.8 // towers in the central 60 degrees ahead stay lower still
export const SKY_MAX_TOTAL_EL = 8.5 // body + crown + antenna may never reach above this elevation (plane trails are fully opaque from 14 degrees)
export const SKY_ATLAS_W = 1024
export const SKY_ATLAS_H = 512
export const SKY_CELL_W = 64 // one facade cell per tower
export const SKY_CELL_H = 480 // rows 480..511 hold flat swatches (roof, antenna)

export interface Tower {
  index: number
  az: number // radians, 0 = straight ahead (-Z), growing toward +X (same convention as the existing city)
  dist: number
  w: number // width, cm
  d: number // depth, cm
  top: number // total height of the tower (body + crown) above eye level, cm
  crownH: number // 0 = no setback crown
  crownW: number
  antH: number // 0 = no antenna
  beacon: boolean // red light on the antenna tip
  cols: number // window columns
  rows: number // window rows over the full height
  palette: number
}

/** Hazy blue/violet body colours of the tower tops. Bright enough on their own (luminance >= 0.6) so the additive display never sees black. */
export const SKY_BODY: number[][] = [[0.52, 0.58, 0.86], [0.58, 0.54, 0.85], [0.5, 0.6, 0.83], [0.6, 0.57, 0.88]]
export const SKY_HAZE: number[] = [0.76, 0.78, 0.96] // the colour the lower part fades toward (atmospheric haze)
export const SKY_ROOF: number[] = [0.74, 0.76, 0.93]
const LIT: number[][] = [[1.0, 0.86, 0.5], [1.0, 0.93, 0.7], [1.0, 0.98, 0.9]] // warm yellow / warm white window specks

/** Small deterministic generator (same Lehmer step the rest of the backdrop uses). */
function makeRnd(seed: number): () => number {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

/** Integer hash -> 0..1, for per-window decisions that must not depend on draw order. */
export function hash01(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647 + 1274126177) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export function skylineTowers(): Tower[] {
  const rnd = makeRnd(20241105)
  const slot = (Math.PI * 2) / SKY_COUNT
  const out: Tower[] = []
  for (let i = 0; i < SKY_COUNT; i++) {
    const az = i * slot + (rnd() - 0.5) * slot * 0.5
    const signed = az > Math.PI ? az - Math.PI * 2 : az
    const dist = SKY_DIST + (rnd() - 0.5) * SKY_DIST_JITTER
    const front = Math.abs(signed) < Math.PI / 6
    let topEl = SKY_MIN_TOP_EL + Math.pow(rnd(), 1.5) * (SKY_MAX_TOP_EL - SKY_MIN_TOP_EL)
    if (front) topEl = Math.min(topEl, SKY_MIN_TOP_EL + rnd() * (SKY_FRONT_MAX_EL - SKY_MIN_TOP_EL))
    const w = dist * Math.tan((2.2 + rnd() * 2.6) * DEG) // 2.2..4.8 degrees wide
    const d = w * (0.7 + 0.2 * rnd())
    const top = Math.tan(topEl * DEG) * dist
    const H = top - SKY_BASE
    const crown = rnd() < 0.6
    const cols = Math.max(6, Math.min(10, Math.round(w / 40)))
    const rows = Math.max(16, Math.min(96, Math.round(H / (w / cols))))
    const hasAnt = i % 3 === 1 // 5 towers carry a thin antenna with a red beacon
    out.push({
      index: i, az, dist, w, d, top,
      crownH: crown ? H * (0.06 + 0.03 * rnd()) : 0,
      crownW: w * 0.72,
      antH: hasAnt ? 100 + 40 * rnd() : 0,
      beacon: hasAnt,
      cols, rows,
      palette: Math.floor(rnd() * SKY_BODY.length)
    })
  }
  return out
}

/** Highest point of a tower as an elevation angle (degrees), antenna and beacon included. */
export function towerTotalElevation(t: Tower): number {
  const beacon = t.beacon ? 30 : 0
  return Math.atan2(t.top + t.antH + beacon, t.dist) / DEG
}

/** UV rectangles of a tower in the atlas: [u0, v0, u1, v1]. Row 0 of the cell is the BASE of the tower (v = 0). */
export function bodyUV(t: Tower): number[] {
  const H = t.top - SKY_BASE
  const f = t.crownH / H
  const u0 = (t.index * SKY_CELL_W + 1) / SKY_ATLAS_W, u1 = ((t.index + 1) * SKY_CELL_W - 1) / SKY_ATLAS_W
  const vTop = SKY_CELL_H / SKY_ATLAS_H
  return [u0, 0.002, u1, vTop * (1 - f)]
}
export function crownUV(t: Tower): number[] {
  const b = bodyUV(t)
  const H = t.top - SKY_BASE
  const f = t.crownH / H
  const vTop = SKY_CELL_H / SKY_ATLAS_H
  return [b[0], vTop * (1 - f), b[2], vTop - 0.002]
}
export const ROOF_UV: number[] = [0.2, (SKY_CELL_H + 8) / SKY_ATLAS_H, 0.3, (SKY_CELL_H + 24) / SKY_ATLAS_H]

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

/** Body colour of a tower at a world height (cm above the eyes): the top is the palette colour, the lower part fades toward the haze colour. */
export function bodyColorAt(palette: number, y: number): number[] {
  const hz = clamp01((300 - y) / 700) * 0.75
  const b = SKY_BODY[palette]
  return [lerp(b[0], SKY_HAZE[0], hz), lerp(b[1], SKY_HAZE[1], hz), lerp(b[2], SKY_HAZE[2], hz)]
}

/** The facade atlas as RGBA8 bytes (SKY_ATLAS_W x SKY_ATLAS_H). Row 0 is the bottom of every cell. Window specks are warm yellow / white. */
export function paintSkylineAtlas(towers: Tower[]): Uint8Array {
  const W = SKY_ATLAS_W, H = SKY_ATLAS_H
  const data = new Uint8Array(W * H * 4)
  const put = (x: number, y: number, c: number[]): void => {
    const o = (y * W + x) * 4
    data[o] = Math.round(255 * clamp01(c[0])); data[o + 1] = Math.round(255 * clamp01(c[1])); data[o + 2] = Math.round(255 * clamp01(c[2])); data[o + 3] = 255
  }
  // default: every texel is a bright hazy blue, never black
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, SKY_ROOF)
  for (const t of towers) {
    const Ht = t.top - SKY_BASE
    const rowPx = SKY_CELL_H / t.rows
    for (let r = 0; r < SKY_CELL_H; r++) {
      const y = SKY_BASE + ((r + 0.5) / SKY_CELL_H) * Ht
      const hz = clamp01((300 - y) / 700) * 0.75
      const body = bodyColorAt(t.palette, y)
      const wr = Math.floor(r / rowPx)
      const fy = r / rowPx - wr // 0..1 inside the window cell
      for (let x = 0; x < SKY_CELL_W; x++) {
        const wc = Math.floor((x * t.cols) / SKY_CELL_W)
        const fx = (x * t.cols) / SKY_CELL_W - wc
        let c = body
        if (fx > 0.15 && fx < 0.85 && fy > 0.15 && fy < 0.85) {
          c = [body[0] * 0.88, body[1] * 0.88, body[2] * 0.9] // unlit glass: a touch darker than the wall, still bright
          const speck = fx > 0.3 && fx < 0.7 && fy > 0.3 && fy < 0.7
          if (speck && hash01(t.index, wc, wr) < 0.28) {
            const l = LIT[Math.floor(hash01(wc, wr, t.index) * LIT.length)]
            const k = 1 - 0.4 * hz // hazier near the base
            c = [lerp(body[0], l[0], k), lerp(body[1], l[1], k), lerp(body[2], l[2], k)]
          }
        }
        put(t.index * SKY_CELL_W + x, r, c)
      }
    }
  }
  return data
}
