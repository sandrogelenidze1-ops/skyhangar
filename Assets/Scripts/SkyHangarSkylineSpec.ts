// SkyHangarSkylineSpec.ts
// Owns: the PURE (no Lens globals) description of the distant skyline SILHOUETTE. Nine distinct tower forms (plus a lower, hazier back row) are drawn as flat
// shapes into one alpha-masked strip texture; the window lights and red beacons go into a second, separate texture so they can be switched off by day.
// Runs unchanged under Node (see Tests/Leaf/SkylineChecks.ts). Deterministic: hand-placed towers plus a fixed hash, no Math.random, no time.
// Must not: create scene objects, materials or textures (SkyHangarSkyline.ts does that).

const DEG = Math.PI / 180

export const STRIP_R = 5400 // cm: beyond the existing buildings (~4870) and inside the sky dome (6000)
export const STRIP_EL_BOTTOM = -2.6 // degrees; the roof parapet hides everything below about -1.9
export const STRIP_EL_TOP = 9 // degrees: nothing is painted above SKY_MAX_EL, so the strip never covers the sky
export const SKY_MAX_EL = 8 // highest painted point (pole tips), degrees
export const SKY_FRONT_MAX_EL = 3.8 // roofs in the central 60 degrees ahead stay lower still
export const TEX_W = 4096
export const TEX_H = 256
export const SEGMENTS = 96
export const PX_PER_DEG = TEX_W / 360
export const POLE_BASE_PX = 1.4 // pole width at its foot in texels (1-2 px visible), tapering to a point
export const POLE_BASE_CM = (POLE_BASE_PX / PX_PER_DEG) * DEG * STRIP_R

/** Front silhouette: deep dusky violet-blue (about RGB 69, 64, 158). Back row: a little lighter and hazier. */
export const COL_FRONT: number[] = [0.27, 0.25, 0.62]
export const COL_BACK: number[] = [0.36, 0.34, 0.7]
export const COL_HAZE: number[] = [0.42, 0.4, 0.82] // the bottom fades toward this
const LIT: number[][] = [[0.95, 0.82, 0.55], [0.95, 0.9, 0.72]] // dim warm yellow / warm white window dashes (the towers are far away)
const RED: number[] = [1.0, 0.16, 0.1]
export const EDITOR_SAT = 1.3

/** The backdrop's one editor-only colour factor (same maths as SkyHangarUtil.editorTone, copied so this file stays pure). */
export function tone(c: number[]): number[] {
  const l = c[0] * 0.3 + c[1] * 0.4 + c[2] * 0.3
  const f = (x: number): number => Math.max(0, Math.min(1, (202 * Math.max(0, Math.min(1, l + (x - l) * EDITOR_SAT)) - 36) / 175))
  return [f(c[0]), f(c[1]), f(c[2])]
}

export type Form = "box" | "wedding" | "pyramid" | "slant" | "twin" | "round" | "notch" | "spire" | "podium"

export interface Tower {
  az: number // centre, degrees (0 = straight ahead, -Z; growing toward +X, same convention as the city)
  w: number // overall width, degrees
  top: number // main roof elevation, degrees
  form: Form
  back: boolean // second, lower, hazier row
  pole: number // pole height above the highest roof point (degrees); 0 = none
  beacon: boolean // tiny red light on the pole tip
  band: boolean // a lit "office band" of three fully lit floors
}

// Front row: 16 towers, four per side (front, right, back, left), the eight forms used twice with different sizes; a few wide low gaps between them.
// Back row: 12 lower, hazier plain towers. Nothing straddles azimuth 0 (the texture seam).
// az, width, top, form, pole, beacon, band
const FRONT: [number, number, number, Form, number, number, number][] = [
  // front side: the central 60 degrees ahead stay low
  [-41, 6.0, 3.5, "podium", 0, 0, 0], [-22, 3.0, 3.2, "round", 0, 0, 0], [4, 3.2, 3.6, "notch", 0, 0, 0], [38, 4.4, 6.0, "wedding", 0.9, 1, 1],
  // right side
  [58, 3.2, 5.0, "pyramid", 0.55, 1, 0], [80, 3.8, 4.2, "slant", 0, 0, 0], [104, 2.6, 5.8, "spire", 1.3, 1, 1], [128, 5.2, 4.4, "twin", 0, 0, 1],
  // back side
  [146, 3.4, 4.3, "round", 0, 0, 0], [168, 4.2, 5.4, "wedding", 0.8, 1, 0], [192, 6.0, 3.8, "podium", 0, 0, 1], [214, 3.4, 4.8, "notch", 0, 0, 0],
  // left side
  [236, 2.8, 5.2, "spire", 1.1, 1, 1], [256, 3.4, 4.4, "pyramid", 0, 0, 0], [281, 5.4, 4.6, "twin", 0, 0, 0], [302, 3.6, 3.8, "slant", 0, 0, 0]
]
const BACK: [number, number, number][] = [
  [-30, 3.0, 2.0], [18, 3.4, 2.4], [48, 3.6, 3.0], [92, 3.2, 2.8], [116, 3.6, 2.6], [157, 3.4, 3.0],
  [181, 3.2, 2.2], [222, 3.6, 2.8], [246, 3.4, 2.5], [268, 3.6, 3.2], [292, 3.4, 2.2], [330, 3.6, 2.6]
]

export function skylineTowers(): Tower[] {
  const out: Tower[] = []
  for (const f of FRONT) out.push({az: f[0], w: f[1], top: f[2], form: f[3], back: false, pole: f[4], beacon: f[5] === 1, band: f[6] === 1})
  for (const b of BACK) out.push({az: b[0], w: b[1], top: b[2], form: "box", back: true, pole: 0, beacon: false, band: false})
  return out
}

const BASE_EL = -3 // shapes start below the strip bottom (it is clipped)

// ---------- geometry ----------
const wrapDeg = (d: number): number => ((d % 360) + 360) % 360
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))
const smooth = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }

/** Elevation (degrees) of a texture row centre. Rows are linear in height on the cylinder (y = R tan el), row 0 = bottom. */
export function rowElevation(r: number): number {
  const yB = Math.tan(STRIP_EL_BOTTOM * DEG), yT = Math.tan(STRIP_EL_TOP * DEG)
  return Math.atan(lerp(yB, yT, (r + 0.5) / TEX_H)) / DEG
}
export function elevationRow(el: number): number {
  const yB = Math.tan(STRIP_EL_BOTTOM * DEG), yT = Math.tan(STRIP_EL_TOP * DEG)
  return ((Math.tan(el * DEG) - yB) / (yT - yB)) * TEX_H - 0.5
}
const yc = (el: number): number => elevationRow(el) + 0.5 // continuous y of an elevation (the centre of row r is r + 0.5)

/** A convex polygon (counter-clockwise, texel coordinates) or an upper half-ellipse; coverage is a soft edge one texel wide. */
export interface Prim {
  poly?: number[] // x0,y0,x1,y1,...
  ell?: number[] // cx, cy, rx, ry
  x0: number; x1: number; y0: number; y1: number // bounding box
  pole?: boolean
}

function polyPrim(pts: number[], pole = false): Prim {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9
  for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]) }
  return {poly: pts, x0, x1, y0, y1, pole}
}

/** Where a tower's pole starts (degrees of elevation). */
function poleBaseEl(t: Tower): number { return t.form === "spire" ? t.top + 0.35 : t.top }

/** Everything one tower is made of, in texel coordinates. */
export function towerPrims(t: Tower): Prim[] {
  const cx = wrapDeg(t.az) * PX_PER_DEG
  const X = (lx: number): number => cx + lx * PX_PER_DEG // local degrees -> texel x
  const Y = (el: number): number => yc(el)
  const rect = (a: number, b: number, lo: number, hi: number): Prim => polyPrim([X(a), Y(lo), X(b), Y(lo), X(b), Y(hi), X(a), Y(hi)])
  const w = t.w, T = t.top, B = BASE_EL
  const out: Prim[] = []
  switch (t.form) {
    case "box": out.push(rect(-w / 2, w / 2, B, T)); break
    case "wedding": // stepped setbacks
      for (const [ws, hf] of [[1, 0.42], [0.76, 0.66], [0.54, 0.84], [0.3, 1]]) out.push(rect((-w * ws) / 2, (w * ws) / 2, B, T * hf))
      break
    case "pyramid": { // tapered crown
      const tb = T - 0.75
      out.push(rect(-w / 2, w / 2, B, tb))
      out.push(polyPrim([X(-w * 0.45), Y(tb - 0.15), X(w * 0.45), Y(tb - 0.15), X(0), Y(T)])) // the crown starts 0.15 degrees (about 3 rows) inside the body: no seam
      break
    }
    case "slant": // angled roof
      out.push(polyPrim([X(-w / 2), Y(B), X(w / 2), Y(B), X(w / 2), Y(T), X(-w / 2), Y(T - 0.9)]))
      break
    case "twin": { // two towers joined by a sky bridge
      const wt = w * 0.36
      out.push(rect(-w / 2, -w / 2 + wt, B, T))
      out.push(rect(w / 2 - wt, w / 2, B, T - 0.5))
      out.push(rect(-w / 2 + wt - 0.3, w / 2 - wt + 0.3, T * 0.5, T * 0.5 + 0.32)) // the bridge reaches 0.3 degrees (3 texels) into both towers
      break
    }
    case "round": { // cylindrical, rounded top
      const tb = T - 0.55
      const cy = Y(tb - 0.2) // the dome's centre sits 0.2 degrees (about 4 rows) inside the body, so the two overlap fully: no seam
      out.push(rect(-w / 2, w / 2, B, tb))
      out.push({ell: [X(0), cy, (w / 2) * PX_PER_DEG, Y(tb + 0.6) - cy], x0: X(-w / 2), x1: X(w / 2), y0: cy, y1: Y(tb + 0.6)})
      break
    }
    case "notch": // split top with a V notch
      out.push(rect(-w / 2, -w * 0.14, B, T))
      out.push(rect(w * 0.14, w / 2, B, T - 0.25))
      out.push(rect(-w * 0.14 - 0.3, w * 0.14 + 0.3, B, T - 1.0)) // overlaps both prongs by 0.3 degrees
      break
    case "spire": // slim tower with a small crown block and a tall pole
      out.push(rect(-w / 2, w / 2, B, T))
      out.push(rect(-w * 0.26, w * 0.26, B, T + 0.35))
      break
    case "podium": // wide podium with a slim tower
      out.push(rect(-w / 2, w / 2, B, T * 0.42))
      out.push(rect(-w * 0.17, w * 0.17, B, T))
      break
  }
  if (t.pole > 0) {
    const pb = poleBaseEl(t)
    out.push(polyPrim([cx - POLE_BASE_PX / 2, Y(pb - 0.15), cx + POLE_BASE_PX / 2, Y(pb - 0.15), cx, Y(pb + t.pole)], true))
  }
  return out
}

/** Highest painted elevation of a tower, pole tip included (degrees). */
export function towerTotal(t: Tower): number { return poleBaseEl(t) + t.pole }

/** Where a tower's light grid sits: left edge texel, floor pitch in rows, first floor row. Columns repeat every COL_PITCH texels, a dash is 2 texels wide. */
export const COL_PITCH = 4
export function towerGrid(t: Tower): {xLeft: number; pitch: number; r0: number} {
  let x0 = 1e9
  for (const p of towerPrims(t)) if (!p.pole) x0 = Math.min(x0, p.x0)
  return {xLeft: Math.round(x0), pitch: t.back ? 8 : 4, r0: Math.round(elevationRow(-1.0))}
}

export function hash01(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647 + 1274126177) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function primCoverage(p: Prim, x: number, y: number): number {
  if (p.ell) {
    if (y < p.ell[1]) return 0
    const q = Math.hypot((x - p.ell[0]) / p.ell[2], (y - p.ell[1]) / p.ell[3])
    return clamp01((1 - q) * Math.min(p.ell[2], p.ell[3]) + 0.5)
  }
  const pts = p.poly as number[]
  const n = pts.length / 2
  let d = 1e9
  for (let i = 0; i < n; i++) {
    const ax = pts[i * 2], ay = pts[i * 2 + 1], bx = pts[((i + 1) % n) * 2], by = pts[((i + 1) % n) * 2 + 1]
    const ex = bx - ax, ey = by - ay
    const len = Math.hypot(ex, ey) || 1
    d = Math.min(d, ((x - ax) * -ey + (y - ay) * ex) / len)
  }
  return clamp01(d + 0.5)
}

export interface Painted {
  sil: Uint8Array // silhouette RGBA (alpha is the mask)
  lights: Uint8Array // window dashes and red beacons RGBA (alpha 0 elsewhere)
  windows: number // candidate window positions on the towers
  lit: number // how many of them are lit
  darkFloors: number // floors switched off entirely
  litPx: number[] // [tower index, x, row] of every lit dash's left texel
  beaconPx: number[][] // [x, row] centres of the red beacons
}

/** Paint both strip textures (TEX_W x TEX_H RGBA8). Row 0 is the bottom. Nothing is black. */
export function paintSkyline(towers: Tower[]): Painted {
  const TF = tone(COL_FRONT), TB = tone(COL_BACK), TH = tone(COL_HAZE)
  const sil = new Uint8Array(TEX_W * TEX_H * 4)
  const lights = new Uint8Array(TEX_W * TEX_H * 4)
  for (let i = 0; i < TEX_W * TEX_H; i++) {
    sil[i * 4] = Math.round(TF[0] * 255); sil[i * 4 + 1] = Math.round(TF[1] * 255); sil[i * 4 + 2] = Math.round(TF[2] * 255)
    lights[i * 4] = 242; lights[i * 4 + 1] = 210; lights[i * 4 + 2] = 140
  }
  const prims = towers.map((t) => towerPrims(t))
  const bounds = prims.map((ps) => ({x0: Math.min(...ps.map((p) => p.x0)) - 2, x1: Math.max(...ps.map((p) => p.x1)) + 2}))
  const owner = new Int16Array(TEX_W * TEX_H) // tower index + 1 where a tower fully covers a texel (indexed x * TEX_H + row)
  const covF = new Float32Array(TEX_H), covB = new Float32Array(TEX_H)
  const ownF = new Int16Array(TEX_H), ownB = new Int16Array(TEX_H)
  const rowFade: number[] = [], rowHaze: number[] = []
  for (let r = 0; r < TEX_H; r++) {
    const el = rowElevation(r)
    rowFade.push(smooth(-1.9, 1.2, el)) // soft gradient into the horizon haze toward the bottom
    rowHaze.push((1 - smooth(-1.4, 2.4, el)) * 0.6)
  }
  for (let x = 0; x < TEX_W; x++) {
    covF.fill(0); covB.fill(0); ownF.fill(0); ownB.fill(0)
    let any = false
    const px = x + 0.5
    for (let ti = 0; ti < towers.length; ti++) {
      if (px < bounds[ti].x0 || px > bounds[ti].x1) continue
      const cov = towers[ti].back ? covB : covF, own = towers[ti].back ? ownB : ownF
      for (const p of prims[ti]) {
        if (px < p.x0 - 1.5 || px > p.x1 + 1.5) continue
        const r0 = Math.max(0, Math.floor(p.y0 - 1.5)), r1 = Math.min(TEX_H - 1, Math.ceil(p.y1 + 1.5))
        for (let r = r0; r <= r1; r++) {
          const c = primCoverage(p, px, r + 0.5)
          if (c > cov[r]) { cov[r] = c; if (c >= 0.95) own[r] = ti + 1 }
        }
        any = true
      }
    }
    if (!any) continue
    for (let r = 0; r < TEX_H; r++) {
      const cf = covF[r], cb = covB[r]
      if (cf === 0 && cb === 0) continue
      const hz = rowHaze[r]
      const a = cf + cb * (1 - cf)
      const k = cf / a
      const c = [0, 1, 2].map((q) => k * lerp(TF[q], TH[q], hz) + (1 - k) * lerp(TB[q], TH[q], hz))
      const o = (r * TEX_W + x) * 4
      sil[o] = Math.round(255 * clamp01(c[0])); sil[o + 1] = Math.round(255 * clamp01(c[1])); sil[o + 2] = Math.round(255 * clamp01(c[2]))
      sil[o + 3] = Math.round(255 * clamp01(a * rowFade[r]))
      owner[x * TEX_H + r] = ownF[r] || (cf < 0.5 ? ownB[r] : 0)
    }
  }

  // ---- window lights: tiny dashes on regular floors, columns aligned between floors; only WHICH windows are lit is decided by a hash ----
  const out: Painted = {sil, lights, windows: 0, lit: 0, darkFloors: 0, litPx: [], beaconPx: []}
  const seenDark = new Set<string>()
  for (let ti = 0; ti < towers.length; ti++) {
    const t = towers[ti]
    const g = towerGrid(t)
    const p = 0.34 + 0.16 * hash01(ti, 3, 7) // 34-50% of the windows lit
    const bandFloor = 6 + Math.floor(hash01(ti, 9, 1) * 6) // first floor of the office band
    const alpha = t.back ? 130 : 215 // dim; the far row dimmer still
    const x0 = Math.max(0, Math.floor(bounds[ti].x0)), x1 = Math.min(TEX_W - 2, Math.ceil(bounds[ti].x1))
    for (let x = x0; x <= x1; x++) {
      if ((((x - g.xLeft) % COL_PITCH) + COL_PITCH) % COL_PITCH !== 1) continue // a dash covers the texels at phase 1 and 2
      const col = Math.floor((x - g.xLeft) / COL_PITCH)
      for (let r = g.r0; r < TEX_H - 1; r += g.pitch) {
        if (owner[x * TEX_H + r] !== ti + 1 || owner[(x + 1) * TEX_H + r] !== ti + 1) continue
        const fl = (r - g.r0) / g.pitch
        out.windows++
        const dark = hash01(ti, fl, 999) < 0.16 // some floors are entirely dark
        const inBand = t.band && fl >= bandFloor && fl < bandFloor + 3
        if (dark && !inBand) { seenDark.add(ti + ":" + fl); continue }
        const lit = hash01(ti, fl * 131 + col, 5) < (inBand ? 0.92 : p)
        if (!lit) continue
        out.lit++
        const l = LIT[hash01(col, fl, ti) < 0.65 ? 0 : 1]
        for (let d = 0; d < 2; d++) {
          const o = (r * TEX_W + x + d) * 4
          lights[o] = Math.round(255 * l[0]); lights[o + 1] = Math.round(255 * l[1]); lights[o + 2] = Math.round(255 * l[2]); lights[o + 3] = alpha
        }
        out.litPx.push(ti, x, r)
      }
    }
  }
  out.darkFloors = seenDark.size
  // ---- red beacons: a 3 x 3 texel light on the tip of each pole (in the lights texture, so they are off by day too) ----
  for (const t of towers) {
    if (!t.beacon || t.pole <= 0) continue
    const bx = Math.floor(wrapDeg(t.az) * PX_PER_DEG), by = Math.floor(yc(poleBaseEl(t) + t.pole))
    out.beaconPx.push([bx, by])
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = (bx + dx + TEX_W) % TEX_W, y = by + dy
        if (y < 0 || y >= TEX_H) continue
        const o = (y * TEX_W + x) * 4
        const k = dx === 0 && dy === 0 ? 1 : 0.7
        lights[o] = Math.round(255 * RED[0] * k); lights[o + 1] = Math.round(255 * RED[1] * k); lights[o + 2] = Math.round(255 * RED[2] * k); lights[o + 3] = Math.round(255 * k)
      }
    }
  }
  return out
}

/**
 * How the skyline looks for the Time of Day weights w = [day, dusk, night] and the backdrop's night-light amount (0 by day, 1 at night):
 * the silhouette is lightened and hazed (more transparent) by day so it melts into the sky; the lights and beacons exist only at night.
 */
export function skylineLook(w: number[], light: number): {silAlpha: number; silTint: number[]; lightAlpha: number} {
  const silAlpha = 0.28 * w[0] + 0.85 * w[1] + 1.0 * w[2]
  const day = [1.0, 1.0, 1.0], dusk = [1.0, 0.97, 1.0], night = [0.92, 0.94, 1.0]
  return {silAlpha, silTint: [0, 1, 2].map((k) => day[k] * w[0] + dusk[k] * w[1] + night[k] * w[2]), lightAlpha: clamp01(light)}
}

/** The cylinder strip: positions [x, y, z] and uv [u, v] per vertex, plus triangle indices. One ring of (SEGMENTS + 1) x 2 vertices. */
export function stripGeometry(): {pos: number[]; uv: number[]; idx: number[]} {
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  const yB = Math.tan(STRIP_EL_BOTTOM * DEG) * STRIP_R, yT = Math.tan(STRIP_EL_TOP * DEG) * STRIP_R
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2
    const x = Math.sin(a) * STRIP_R, z = -Math.cos(a) * STRIP_R
    pos.push(x, yB, z, x, yT, z)
    uv.push(i / SEGMENTS, 0, i / SEGMENTS, 1)
    if (i < SEGMENTS) {
      const k = i * 2
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  }
  return {pos, uv, idx}
}
