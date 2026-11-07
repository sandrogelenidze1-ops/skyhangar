// SkyHangarFacade.ts
// Owns: the procedural facade atlases for the PREVIEW-ONLY city (used by SkyHangarRooftopBackdrop). There are only FIVE atlas textures, one per
// horizon-step compensation level, generated once at startup (and again only when Time of Day changes, at most ten times a second). Each atlas holds
// every building style: per style 36 window-bay variants (plain windows with different lit thresholds, window + AC box, window + balcony with railing,
// fire escape, ground-floor shopfront with awning, light-left / shaded-right / light-top edge bays) plus a row of solid cells (wall, shaded wall,
// parapet cap, metal, tank, AC). Sills, railings, awnings and floor bands are baked into the texture, never separate objects. Per-building variation
// comes from which style and which cells the UVs pick. Windows flicker by repainting just the two flicker columns of each style (a small rectangle).
// Every colour is lifted to the time-of-day luminance floor and the horizon-step compensation is baked per atlas. All opaque, all procedural.

import {minLuminance, editorTone, EDITOR_SAT} from "./SkyHangarUtil"

type RGB = [number, number, number]

export const BAY_W = 20
export const BAY_H = 24
export const ATLAS_COLS = 12
export const ROWS_PER_STYLE = 4 // 3 variant rows + 1 solid row
export const ATLAS_W = BAY_W * ATLAS_COLS

/** How the windows of a style are drawn: the classic framed window, or one of the modern facades. */
export type FacadeKind = "classic" | "ribbon" | "curtain" | "panes" | "fins"

export interface FacadeStyle {
  name: string
  wall: RGB
  frame: RGB
  accent: RGB // awning stripes
  facade?: FacadeKind // default "classic"
  tintMix?: number // how much of the cool night wall tint this style takes (default 1; the warm sand keeps most of its own warmth)
  glassMul?: number // glass brightness (default 1; the deep-glass tower is a little deeper, but still lifted above the luminance floor)
}

// Five classic styles (framed windows) in the night palette: muted brick red-brown, light grey-blue (off-white), concrete / stone and soft blue-grey. Time of Day
// never changes these hues: day is the same colours, only a little brighter, a little desaturated and a little hazier with distance.
// Six modern facades (each building gets one deterministically): continuous ribbon windows, a curtain-wall glass grid with thin mullions, large floor-to-ceiling
// panes and a vertical-fin facade, in white, concrete grey, deep (but still bright enough) glass and warm sand.
export const STYLES: FacadeStyle[] = [
  {name: "concrete", wall: [0.8, 0.76, 0.7], frame: [0.95, 0.94, 0.9], accent: [0.62, 0.45, 0.38]},
  {name: "brick", wall: [0.72, 0.46, 0.38], frame: [0.93, 0.9, 0.84], accent: [0.52, 0.6, 0.7]},
  {name: "stone", wall: [0.78, 0.75, 0.7], frame: [0.4, 0.46, 0.52], accent: [0.62, 0.45, 0.38]},
  {name: "offwhite", wall: [0.93, 0.91, 0.85], frame: [0.42, 0.5, 0.56], accent: [0.52, 0.6, 0.7]},
  {name: "slate", wall: [0.52, 0.6, 0.7], frame: [0.94, 0.95, 0.96], accent: [0.62, 0.45, 0.38]},
  {name: "ribbon-white", wall: [0.95, 0.95, 0.96], frame: [0.5, 0.58, 0.66], accent: [0.52, 0.6, 0.7], facade: "ribbon"},
  {name: "ribbon-concrete", wall: [0.7, 0.71, 0.73], frame: [0.9, 0.92, 0.94], accent: [0.52, 0.6, 0.7], facade: "ribbon"},
  {name: "curtain-deepglass", wall: [0.5, 0.58, 0.68], frame: [0.82, 0.86, 0.9], accent: [0.52, 0.6, 0.7], facade: "curtain", glassMul: 0.85, tintMix: 0.6},
  {name: "curtain-glass", wall: [0.72, 0.8, 0.88], frame: [0.95, 0.96, 0.97], accent: [0.52, 0.6, 0.7], facade: "curtain"},
  {name: "panes-sand", wall: [0.86, 0.78, 0.6], frame: [0.64, 0.56, 0.42], accent: [0.62, 0.45, 0.38], facade: "panes", tintMix: 0.4},
  {name: "fins-concrete", wall: [0.72, 0.73, 0.75], frame: [0.5, 0.58, 0.66], accent: [0.52, 0.6, 0.7], facade: "fins"}
]
export const NEUTRAL_STYLES = [0, 1, 2, 3, 4] // classic windows
export const MUTED_STYLES = [5, 6, 7, 8, 9, 10] // modern facades
export const ACCENT_STYLE = 5
export const ATLAS_H = STYLES.length * ROWS_PER_STYLE * BAY_H

export interface BayVariant {
  kind: "win" | "ac" | "balc" | "fire" | "shop" | "L" | "R" | "T" | "solid"
  thr: number // lit threshold: lit when the lit fraction passes it
  flick: boolean
  warm: RGB
}
// ONE soft warm white-yellow for every lit window (the four entries differ by about 2% in tone only, so panes never show random hues)
const WARM: RGB[] = [[1.0, 0.9, 0.68], [0.98, 0.88, 0.66], [1.0, 0.91, 0.69], [0.97, 0.89, 0.67]]
export const VARIANTS: BayVariant[] = []
for (let i = 0; i < 12; i++) VARIANTS.push({kind: "win", thr: (i + 0.5) / 12, flick: i < 2, warm: WARM[i % 4]})
for (let i = 0; i < 4; i++) VARIANTS.push({kind: "ac", thr: (i + 0.5) / 4, flick: false, warm: WARM[i % 4]})
for (let i = 0; i < 4; i++) VARIANTS.push({kind: "balc", thr: (i + 0.5) / 4, flick: false, warm: WARM[(i + 1) % 4]})
for (let i = 0; i < 2; i++) VARIANTS.push({kind: "fire", thr: (i + 0.5) / 2, flick: false, warm: WARM[i]})
for (let i = 0; i < 2; i++) VARIANTS.push({kind: "shop", thr: (i + 0.3) / 1.6, flick: false, warm: WARM[i]})
for (let i = 0; i < 3; i++) VARIANTS.push({kind: "L", thr: 0.2 + 0.3 * i, flick: false, warm: WARM[i]})
for (let i = 0; i < 3; i++) VARIANTS.push({kind: "R", thr: 0.2 + 0.3 * i, flick: false, warm: WARM[i + 1]})
for (let i = 0; i < 3; i++) VARIANTS.push({kind: "T", thr: 0.2 + 0.3 * i, flick: false, warm: WARM[i]})
for (let i = 0; i < 12; i++) VARIANTS.push({kind: "solid", thr: 0, flick: false, warm: WARM[0]}) // 36..47: solid row

/** Variant index helpers used by the mesh builder. */
export const V_WIN = 0, V_AC = 12, V_BALC = 16, V_FIRE = 20, V_SHOP = 22, V_L = 24, V_R = 27, V_T = 30
export const S_WALL = 36, S_WALLSH = 37, S_CAP = 38, S_METAL = 39, S_TANK = 40, S_AC = 41

export interface FacadeTime {
  frac: number // fraction of windows lit (0 day, 0.55 dusk, 0.35 night)
  floor: number // luminance floor
  tint: RGB // multiplier for walls: always the night grade (the day never changes the hues)
  glass: RGB // glass tone
  t: number // seconds, for flicker
  day: number // 0 at night .. 1 by day: how much of the gentle day grade (brighter, slightly desaturated) is applied
  haze: number // 0..1: how far colours are pulled toward the cool grey-blue haze (more for far buildings, only by day)
}

// ---- Time of Day for the facades (pure, so it can be checked under Node) ----
export const NIGHT_TINT: RGB = [0.62, 0.66, 0.96] // the night wall tint: the reference hues
// ONE glass colour family, always blue: by day a calm, lighter, desaturated blue-grey; at night a deep blue (still lifted above the luminance floor, never black)
const GLASS_TONE: RGB[] = [[0.62, 0.72, 0.84], [0.46, 0.57, 0.8], [0.3, 0.4, 0.74]]
const LIT_FRAC = [0, 0.42, 0.42] // how far the lit threshold has risen: no lit windows by day; at dusk and night about 30% of all windows end up lit (see FLOOR_DARK)
export const FLOOR_DARK = 0.18 // share of floors that are fully dark at night

/** Whether floor `r` (0 = top) of building `b` (an integer seed) is fully dark: decided per floor, so a whole floor is dark or none of it is. Pure hash. */
export function floorIsDark(b: number, r: number): boolean {
  let h = (b * 374761393 + r * 668265263 + 1274126177) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296 < FLOOR_DARK
}
/** The variant of the same kind that is never lit at night (highest lit threshold): used on dark floors. */
export function darkVariant(vi: number): number {
  if (vi < 12) return 11 // plain window
  if (vi < 16) return 15 // window + AC box (V_AC + 3)
  if (vi < 20) return 19 // window + balcony (V_BALC + 3)
  if (vi < 22) return 21 // fire escape bay (V_FIRE + 1)
  if (vi < 24) return vi // shop: ground floor, unchanged
  if (vi < 27) return 26 // left edge (V_L + 2)
  if (vi < 30) return 29 // right edge (V_R + 2)
  return 32 // top edge (V_T + 2)
}
const FACADE_FLOOR = [0.44, 0.41, 0.38] // luminance floors for the walls: day, dusk, night (the additive display needs bright colours, but day stays close to night)
export const HAZE_COLOR: RGB = [0.72, 0.77, 0.85] // cool light grey-blue
export const DAY_DESAT = 0.18 // by day colours lose this much saturation...
export const DAY_BRIGHT = 0.1 // ...and gain this much brightness

function mixw(c: number[][], w: number[]): RGB { return [0, 1, 2].map((k) => c[0][k] * w[0] + c[1][k] * w[1] + c[2][k] * w[2]) as RGB }
/** Facade time inputs for the Time of Day weights w = [day, dusk, night]; haze is the far-building haze amount at full day (0 = none). */
export function facadeTimeFor(w: number[], haze: number, t: number): FacadeTime {
  const day = w[0] + 0.5 * w[1]
  return {
    frac: LIT_FRAC[0] * w[0] + LIT_FRAC[1] * w[1] + LIT_FRAC[2] * w[2],
    floor: FACADE_FLOOR[0] * w[0] + FACADE_FLOOR[1] * w[1] + FACADE_FLOOR[2] * w[2],
    tint: NIGHT_TINT,
    glass: mixw(GLASS_TONE, w),
    t, day, haze: haze * day
  }
}

export class FacadeAtlas {
  tex: Texture
  data = new Uint8Array(ATLAS_W * ATLAS_H * 4)
  constructor() {
    this.tex = ProceduralTextureProvider.createWithFormat(ATLAS_W, ATLAS_H, TextureFormat.RGBA8Unorm)
  }
}

const buf = new Float32Array(BAY_W * BAY_H * 3)

function mul(c: number[], k: number): RGB { return [c[0] * k, c[1] * k, c[2] * k] }
function mixc(a: number[], b: number[], t: number): RGB { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] }
function sm(a: number, b: number, x: number): number { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

interface Pal {
  wall: RGB; wallHi: RGB; band: RGB; bandHi: RGB; bandLo: RGB; frame: RGB; accent: RGB; accent2: RGB
  glassTop: RGB; glassBot: RGB; metal: RGB; acBody: RGB; slot: RGB; cap: RGB; tank: RGB
  kind: FacadeKind
}

/** One palette for a style at the given time of day and shade (1 = lit side, 0.78 = shaded side): every colour is lifted to the luminance floor. */
function makePalette(st: FacadeStyle, ft: FacadeTime, shade: number): Pal {
  // the day grade: the same colours, a touch desaturated and brighter, then a little pulled toward the cool haze (never more saturated than at night)
  const grade = (c: number[]): RGB => {
    const l = c[0] * 0.3 + c[1] * 0.4 + c[2] * 0.3
    const k = 1 + DAY_BRIGHT * ft.day, d = 1 - DAY_DESAT * ft.day
    return mixc([0, 1, 2].map((q) => (l + (c[q] - l) * d) * k), HAZE_COLOR, ft.haze)
  }
  const lift = (c: number[]): RGB => minLuminance(grade(c.map((x) => Math.min(1, x))), ft.floor)
  const tm = st.tintMix === undefined ? 1 : st.tintMix
  const tint = [0, 1, 2].map((k) => 1 + (ft.tint[k] - 1) * tm) // the night wall tint (the reference hues), softened for the warm sand
  const gm = st.glassMul === undefined ? 1 : st.glassMul
  const wall0 = [0, 1, 2].map((k) => st.wall[k] * tint[k])
  const wall = lift(mul(wall0, shade))
  return {
    wall,
    wallHi: lift(mul(wall0, 1.12 * shade)),
    band: lift(mul(wall0, 1.05 * shade)),
    bandHi: lift(mul(wall0, 1.16 * shade)),
    bandLo: lift(mul(wall0, 0.88 * shade)),
    frame: lift(mul(st.frame.map((x, k) => x * tint[k]), shade)),
    accent: lift(mul(st.accent.map((x, k) => x * tint[k]), shade)),
    accent2: lift(mul([1, 0.97, 0.92].map((x, k) => x * tint[k]), shade)),
    glassTop: lift(mul(ft.glass.map((x) => x * 1.04 * gm), shade)),
    glassBot: lift(mul(ft.glass.map((x) => x * 0.96 * gm), shade)),
    metal: lift(mul([0.5, 0.55, 0.62], shade)),
    acBody: lift(mul([0.9, 0.92, 0.93], shade)),
    slot: lift(mul([0.55, 0.58, 0.64], shade)),
    cap: lift(mul(wall0.map((x) => x * 0.4 + 0.58), shade)),
    tank: lift(mul([0.82, 0.86, 0.92].map((x, k) => x * tint[k]), shade)),
    kind: st.facade || "classic"
  }
}

function put(x: number, y: number, c: number[]): void {
  if (x < 0 || y < 0 || x >= BAY_W || y >= BAY_H) return
  const i = (y * BAY_W + x) * 3
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]
}
function fill(x0: number, y0: number, x1: number, y1: number, c: number[]): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c)
}

/** How lit one pane of a bay is (0..1): each pane k has its own threshold, so the lit pattern varies along a floor but always stays inside its floor. */
function paneLit(v: BayVariant, vi: number, ft: FacadeTime, k: number): number {
  const th = (v.thr * 0.97 + 0.31 * k) % 1
  let lit = sm(th, th + 0.1, ft.frac)
  if (v.flick) lit *= 0.78 + 0.22 * Math.sin(ft.t * 3.3 + vi * 1.9)
  return lit
}

/**
 * The modern facades. One bay = one floor (rows 0..20 are the floor, 21..23 the slab edge, already painted), so every lit pattern follows the floors.
 * Real-architecture proportions: glass bands are about 55-80% of a floor, an OPAQUE spandrel panel sits between the glass bands, mullions are thin
 * (1 px, lower contrast than the frame so they do not shimmer at distance), the glass has a soft vertical reflection gradient (sky-bright at the top,
 * deeper at the bottom) and a faint per-pane tone step, and the corner / roofline bays get a slightly darker frame.
 */
function paintModern(v: BayVariant, vi: number, P: Pal, ft: FacadeTime): void {
  const dark = minLuminance(mul(P.frame, 0.8), ft.floor) // frame at corners and the roofline: a little darker, still above the luminance floor
  const mull = mixc(P.frame, P.glassBot, 0.4) // thin mullion: close to the glass tone so a single pixel line stays calm
  const spandrel = minLuminance(mixc(P.wall, P.glassBot, 0.3), ft.floor) // opaque panel between glass bands: never lit
  const spandrelTop = minLuminance(mul(spandrel, 0.86), ft.floor) // shadow line under the glass sill
  const lit = (k: number): number => paneLit(v, vi, ft, k)
  // glass with the vertical reflection gradient: the upper fifth catches the sky, then it deepens toward the sill; each pane steps by up to +-2%
  const glass = (y: number, y0: number, y1: number, k: number): RGB => {
    const t = (y - y0) / Math.max(1, y1 - y0)
    const sheen = 1 + 0.07 * Math.pow(1 - t, 3)
    return mul(mixc(P.glassTop, P.glassBot, t), sheen * (1 + 0.02 * (((k * 37) % 5) - 2) / 2))
  }
  const pane = (x0: number, x1: number, y0: number, y1: number, k: number): void => {
    const l = lit(k) * 0.9
    for (let y = y0; y <= y1; y++) fill(x0, y, x1, y, mixc(glass(y, y0, y1, k), v.warm, l))
  }
  const bandRows = (y0: number, y1: number, c: number[]): void => fill(0, y0, BAY_W - 1, y1, c)
  if (P.kind === "ribbon") { // continuous horizontal glass band, soffit above, opaque spandrel below, a mullion every half bay
    bandRows(0, 2, P.bandLo)
    bandRows(3, 3, P.frame)
    pane(0, 9, 4, 13, 0)
    pane(10, 19, 4, 13, 1)
    bandRows(14, 14, P.frame)
    bandRows(15, 15, spandrelTop)
    bandRows(16, 20, spandrel)
    fill(0, 4, 0, 13, mull)
    fill(10, 4, 10, 13, mull)
  } else if (P.kind === "curtain") { // glass grid: 2 x 2 panes, thin mullions and a transom, spandrel panel at the slab
    bandRows(0, 0, P.frame)
    pane(0, 9, 1, 7, 0)
    pane(10, 19, 1, 7, 1)
    bandRows(8, 8, mull)
    pane(0, 9, 9, 15, 0) // both pane rows of a floor share one light, so lit windows read as whole floor columns, not a checkerboard
    pane(10, 19, 9, 15, 1)
    bandRows(16, 16, P.frame)
    bandRows(17, 20, spandrel)
    fill(0, 1, 0, 15, mull)
    fill(10, 1, 10, 15, mull)
  } else if (P.kind === "panes") { // one floor-to-ceiling pane between piers, a hairline centre mullion, a low kick panel
    bandRows(0, 0, P.frame)
    fill(0, 1, 1, 20, P.wall)
    fill(18, 1, 19, 20, P.wall)
    pane(2, 17, 1, 17, 0)
    fill(9, 1, 9, 17, mull)
    bandRows(18, 18, P.frame)
    fill(2, 19, 17, 20, spandrel)
  } else { // fins: floor-to-ceiling glass between thin vertical fins (a light face and a shadow beside it)
    bandRows(0, 0, P.frame)
    for (let k = 0; k < 4; k++) {
      const x0 = k * 5
      fill(x0, 1, x0, 19, P.bandHi)
      pane(x0 + 1, x0 + 3, 1, 19, k)
      fill(x0 + 4, 1, x0 + 4, 19, P.bandLo)
    }
    bandRows(20, 20, P.bandLo)
  }
  // darker frame at the corners and the roofline
  if (v.kind === "L") fill(0, 0, 1, 20, dark)
  else if (v.kind === "R") fill(BAY_W - 2, 0, BAY_W - 1, 20, dark)
  else if (v.kind === "T") fill(0, 0, BAY_W - 1, 2, dark)
}

function paintBay(v: BayVariant, vi: number, pal: Pal, palShade: Pal, ft: FacadeTime): void {
  const P = v.kind === "R" ? palShade : pal
  if (v.kind === "solid") {
    const idx = vi - 36
    const base = idx === 0 ? pal.wall : idx === 1 ? palShade.wall : idx === 2 ? pal.cap : idx === 3 ? pal.metal : idx === 4 ? pal.tank : idx === 5 ? pal.acBody : pal.wall
    for (let y = 0; y < BAY_H; y++) fill(0, y, BAY_W - 1, y, mul(base, 1.04 - 0.08 * (y / (BAY_H - 1))))
    return
  }
  // wall with a subtle vertical gradient (lighter at the top, a little darker at the bottom)
  for (let y = 0; y < BAY_H; y++) {
    const g = 1.05 - 0.1 * (y / (BAY_H - 1))
    for (let x = 0; x < BAY_W; x++) put(x, y, mul(P.wall, g))
  }
  if (v.kind === "L") fill(0, 0, 1, BAY_H - 1, P.wallHi) // light left edge
  if (v.kind === "R") fill(BAY_W - 2, 0, BAY_W - 1, BAY_H - 1, P.bandLo) // shaded right edge
  // floor band at the bottom: highlight line, band, shadow line
  fill(0, 21, BAY_W - 1, 21, P.bandHi)
  fill(0, 22, BAY_W - 1, 22, P.band)
  fill(0, 23, BAY_W - 1, 23, P.bandLo)
  if (v.kind === "T") {
    fill(0, 0, BAY_W - 1, 1, P.cap) // light top edge
    fill(0, 2, BAY_W - 1, 2, P.bandLo)
  }
  // how lit this bay is now: smooth in the fraction so nothing pops while the time of day moves
  let lit = sm(v.thr, v.thr + 0.1, ft.frac)
  if (v.flick) lit *= 0.78 + 0.22 * Math.sin(ft.t * 3.3 + vi * 1.9)
  if (v.kind === "shop") {
    for (let x = 1; x <= 18; x++) fill(x, 3, x, 6, ((x >> 1) & 1) === 0 ? P.accent : P.accent2) // awning stripes
    fill(1, 7, 18, 7, P.bandLo)
    for (let y = 8; y <= 20; y++) fill(2, y, 17, y, mixc(mixc(P.glassTop, P.glassBot, (y - 8) / 12), v.warm, lit * 0.9))
    fill(8, 9, 11, 20, P.frame)
    fill(9, 10, 10, 20, mixc(P.glassBot, v.warm, lit))
    fill(2, 8, 17, 8, P.frame)
    return
  }
  if (P.kind !== "classic") { paintModern(v, vi, P, ft); return } // the modern facades draw their own windows (AC / balcony / fire-escape variants become plain bays)
  // window: frame, glass (top lighter), mullion + transom, sill
  fill(4, 4, 15, 17, P.frame)
  for (let y = 5; y <= 16; y++) fill(5, y, 14, y, mixc(mixc(P.glassTop, P.glassBot, (y - 5) / 11), v.warm, lit))
  fill(9, 5, 10, 16, P.frame)
  fill(5, 10, 14, 10, P.frame)
  fill(3, 18, 16, 18, P.bandHi)
  fill(3, 19, 16, 19, P.bandLo)
  if (v.kind === "ac") {
    fill(6, 19, 13, 22, P.acBody)
    fill(6, 19, 13, 19, P.bandHi)
    fill(6, 20, 13, 20, P.slot)
    fill(6, 22, 13, 22, P.slot)
  } else if (v.kind === "balc") {
    fill(1, 19, 18, 20, P.bandHi) // balcony slab
    fill(1, 14, 18, 14, P.metal) // top rail
    for (let x = 2; x <= 18; x += 2) fill(x, 15, x, 18, P.metal) // balusters
  } else if (v.kind === "fire") {
    fill(1, 19, 18, 20, P.metal) // platform
    fill(1, 15, 18, 15, P.metal)
    for (let x = 1; x <= 18; x += 3) fill(x, 16, x, 18, P.metal)
    for (let i = 0; i < 15; i++) fill(2 + i, Math.round(19 - i * 0.62), 3 + i, Math.round(19 - i * 0.62), P.metal) // stair run
  }
}

/** Write one painted variant (current contents of `buf`) into an atlas data array at the cell (col, row), with the uniform editor tone. */
function writeCell(d: Uint8Array, col: number, row: number): void {
  const ox = col * BAY_W, oy = row * BAY_H
  // editorTone (SkyHangarUtil) inlined: the same arithmetic, without an array and three closures per pixel; runs of equal pixels (flat fills) reuse the last result.
  let lr = -1, lg = -1, lb = -1, o0 = 0, o1 = 0, o2 = 0
  for (let y = 0; y < BAY_H; y++) {
    const r = oy + (BAY_H - 1 - y) // texture row 0 is the bottom of the image
    for (let x = 0; x < BAY_W; x++) {
      const s = (y * BAY_W + x) * 3
      const o = (r * ATLAS_W + ox + x) * 4
      const cr = buf[s], cg = buf[s + 1], cb = buf[s + 2]
      if (cr !== lr || cg !== lg || cb !== lb) {
        lr = cr; lg = cg; lb = cb
        const l = cr * 0.3 + cg * 0.4 + cb * 0.3
        o0 = Math.round(255 * Math.max(0, Math.min(1, (202 * Math.max(0, Math.min(1, l + (cr - l) * EDITOR_SAT)) - 36) / 175)))
        o1 = Math.round(255 * Math.max(0, Math.min(1, (202 * Math.max(0, Math.min(1, l + (cg - l) * EDITOR_SAT)) - 36) / 175)))
        o2 = Math.round(255 * Math.max(0, Math.min(1, (202 * Math.max(0, Math.min(1, l + (cb - l) * EDITOR_SAT)) - 36) / 175)))
      }
      d[o] = o0; d[o + 1] = o1; d[o + 2] = o2
      d[o + 3] = 255
    }
  }
}

/** The glass of a style at a time of day: [top, bottom] colours of a pane (0..1, before the editor tone). For checks. */
export function facadeGlass(style: number, ft: FacadeTime): RGB[] {
  const p = makePalette(STYLES[style], ft, 1)
  return [p.glassTop, p.glassBot]
}

/** Final colour (0..255, with the editor tone) of a lit wall of a style: what the atlas shows. For checks. */
export function facadeWallColor(style: number, ft: FacadeTime): number[] {
  const t = editorTone(makePalette(STYLES[style], ft, 1).wall)
  return t.map((v) => Math.round(255 * v))
}

/** One painted window bay (BAY_W x BAY_H x 3 floats, row 0 = top) of a style and variant: what the atlas cell holds before the editor tone. For checks. */
export function facadeBay(style: number, vi: number, ft: FacadeTime): Float32Array {
  const pal = makePalette(STYLES[style], ft, 1), palShade = makePalette(STYLES[style], ft, 0.78)
  paintBay(VARIANTS[vi], vi, pal, palShade, ft)
  return buf.slice()
}

/** Repaint a whole atlas (every style, every variant): palette lifted to the floor, editor tone baked in. */
export function paintAtlas(a: FacadeAtlas, ft: FacadeTime): void {
  for (let si = 0; si < STYLES.length; si++) {
    const pal = makePalette(STYLES[si], ft, 1)
    const palShade = makePalette(STYLES[si], ft, 0.78)
    for (let vi = 0; vi < VARIANTS.length; vi++) {
      paintBay(VARIANTS[vi], vi, pal, palShade, ft)
      writeCell(a.data, vi % ATLAS_COLS, si * ROWS_PER_STYLE + Math.floor(vi / ATLAS_COLS))
    }
  }
  ;(a.tex.control as ProceduralTextureProvider).setPixels(0, 0, ATLAS_W, ATLAS_H, a.data)
}

const strip = new Uint8Array(2 * BAY_W * BAY_H * 4)
/** Flicker: repaint only the two flicker window cells of one style (a 40 x 24 px rectangle) and upload just that rectangle. */
const palCache = new WeakMap<FacadeTime, {[style: number]: {pal: Pal; shade: Pal}}>()
export function paintFlicker(a: FacadeAtlas, ft: FacadeTime, style: number): void {
  // The palettes depend on the style and the facade time (replaced as a whole whenever Time of Day changes), not on the flicker clock `ft.t`: built once per (ft, style).
  let byStyle = palCache.get(ft)
  if (!byStyle) { byStyle = {}; palCache.set(ft, byStyle) }
  let pp = byStyle[style]
  if (!pp) { pp = {pal: makePalette(STYLES[style], ft, 1), shade: makePalette(STYLES[style], ft, 0.78)}; byStyle[style] = pp }
  const pal = pp.pal, palShade = pp.shade
  const row = style * ROWS_PER_STYLE
  for (let vi = 0; vi < 2; vi++) {
    paintBay(VARIANTS[vi], vi, pal, palShade, ft)
    writeCell(a.data, vi, row)
  }
  for (let y = 0; y < BAY_H; y++) {
    const src = ((row * BAY_H + y) * ATLAS_W) * 4
    const dst = (y * 2 * BAY_W) * 4
    for (let k = 0; k < 2 * BAY_W * 4; k++) strip[dst + k] = a.data[src + k]
  }
  ;(a.tex.control as ProceduralTextureProvider).setPixels(0, row * BAY_H, 2 * BAY_W, BAY_H, strip)
}

/** UV rectangle [u0, v0, u1, v1] of a variant of a style, inset a little so bilinear filtering never bleeds into the neighbour. */
export function variantUV(style: number, vi: number): number[] {
  const col = vi % ATLAS_COLS, row = style * ROWS_PER_STYLE + Math.floor(vi / ATLAS_COLS)
  return [(col * BAY_W + 1.5) / ATLAS_W, (row * BAY_H + 1.5) / ATLAS_H, ((col + 1) * BAY_W - 1.5) / ATLAS_W, ((row + 1) * BAY_H - 1.5) / ATLAS_H]
}

/** Props atlas (one 96 x 32 texture, three cells): AC front grille, AC fan top, louvered vent. Opaque, light metal, slots stay above the floor. */
export function propsAtlasTexture(floor: number): Texture {
  const W = 96, H = 32
  const tex = ProceduralTextureProvider.createWithFormat(W, H, TextureFormat.RGBA8Unorm)
  const d = new Uint8Array(W * H * 4)
  const lift = (c: number[]) => minLuminance(c, floor)
  const body = lift([0.9, 0.92, 0.93]), hi = lift([1, 1, 1]), slot = minLuminance([0.3, 0.33, 0.38], 0.3), edge = lift([0.7, 0.73, 0.78])
  for (let cell = 0; cell < 3; cell++) {
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        let c: number[] = body
        const border = x < 2 || y < 2 || x >= 30 || y >= 30
        if (border) c = (x < 1 || y >= 31) ? edge : hi
        else if (cell === 0) c = (y % 4 === 1 || y % 4 === 2) && x > 3 && x < 28 ? slot : body
        else if (cell === 2) c = y % 5 < 2 ? slot : (y % 5 === 2 ? hi : body)
        else {
          const dx = x - 15.5, dy = y - 15.5, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx)
          if (r < 3) c = edge
          else if (r < 13) c = Math.abs(Math.sin(ang * 3 + r * 0.25)) < 0.22 ? slot : body
          else if (r < 15) c = r < 14 ? slot : hi
        }
        const o = (y * W + cell * 32 + x) * 4
        d[o] = Math.round(255 * c[0]); d[o + 1] = Math.round(255 * c[1]); d[o + 2] = Math.round(255 * c[2]); d[o + 3] = 255
      }
    }
  }
  ;(tex.control as ProceduralTextureProvider).setPixels(0, 0, W, H, d)
  return tex
}
/** UV rects of the three props cells. */
export const PROPS_UV = {grille: [1.5 / 96, 1.5 / 32, 30.5 / 96, 30.5 / 32], fan: [33.5 / 96, 1.5 / 32, 62.5 / 96, 30.5 / 32], louver: [65.5 / 96, 1.5 / 32, 94.5 / 96, 30.5 / 32]}
