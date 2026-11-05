// SkyHangarSkylineSpec.ts
// Owns: the PURE (no Lens globals) description of the distant skyline SILHOUETTE: a flat, alpha-masked strip painted into one texture, wrapped on a
// cylinder around the viewer. Towers, stepped tops, spires, haze gradient, sparse light specks and red beacons are all painted here.
// Runs unchanged under Node (see Tests/Leaf/SkylineChecks.ts). Deterministic: hand-placed clusters plus a fixed hash, no Math.random, no time.
// Must not: create scene objects, materials or textures (SkyHangarSkyline.ts does that).

const DEG = Math.PI / 180

export const STRIP_R = 5400 // cm: beyond the existing buildings (~4870) and inside the sky dome (6000)
export const STRIP_EL_BOTTOM = -2.6 // degrees; the roof parapet hides everything below about -1.9
export const STRIP_EL_TOP = 9 // degrees: nothing is painted above SKY_MAX_EL, so the strip never covers the sky
export const SKY_MAX_EL = 8 // highest painted point (spire tips), degrees
export const SKY_FRONT_MAX_EL = 3.8 // towers in the central 60 degrees ahead stay lower still
export const TEX_W = 4096
export const TEX_H = 256
export const SEGMENTS = 96

/** Front silhouette: deep dusky violet-blue (about RGB 69, 64, 158). Back row: a little lighter and hazier. */
export const COL_FRONT: number[] = [0.27, 0.25, 0.62]
export const COL_BACK: number[] = [0.36, 0.34, 0.7]
export const COL_HAZE: number[] = [0.42, 0.4, 0.82] // the bottom fades toward this (it is the horizon haze of the sky, only a little darker)
const LIT: number[][] = [[1.0, 0.9, 0.62], [1.0, 0.97, 0.85]] // warm yellow / warm white specks
const RED: number[] = [1.0, 0.16, 0.1]
export const EDITOR_SAT = 1.3
/** The backdrop's one editor-only colour factor (same maths as SkyHangarUtil.editorTone, copied so this file stays pure): the preview lifts dark pixels,
 * so authored colours are cut down by it to land on the intended look. Applied to the silhouette and haze colours, not to the light specks. */
export function tone(c: number[]): number[] {
  const l = c[0] * 0.3 + c[1] * 0.4 + c[2] * 0.3
  const f = (x: number): number => Math.max(0, Math.min(1, (202 * Math.max(0, Math.min(1, l + (x - l) * EDITOR_SAT)) - 36) / 175))
  return [f(c[0]), f(c[1]), f(c[2])]
}
export const LIT_FRACTION = 0.065 // share of the front towers' texels that are light specks

export interface Tower {
  az: number // centre, degrees (0 = straight ahead, -Z; growing toward +X, same convention as the city)
  w: number // width, degrees
  top: number // roof elevation, degrees
  back: boolean // second, lower, hazier row
  step: number // extra height of a narrower stepped top (degrees); 0 = flat roof
  spire: number // spire height above the roof (degrees); 0 = none
  beacon: boolean // red light on the spire / antenna tip
}

// Front row (10) in four loose clusters, back row (4) a little lower and lighter between and behind them.
// az, width, top, step, spire, beacon
const FRONT: number[][] = [
  [-41, 3.6, 3.4, 0, 0, 0], [-35, 2.8, 3.8, 0.5, 0, 0], [-29.5, 3.4, 3.2, 0, 0.5, 1], // ahead-left cluster, low (the central 60 degrees stay <= 3.8)
  [48, 3.2, 4.6, 0, 0, 0], [54, 4.4, 6.2, 0.8, 0.9, 1], [60.5, 3, 5.2, 0, 0, 0], // tall cluster to the right with the tallest tower and a spire
  [150, 3.6, 4.2, 0.6, 0, 0], [156, 3, 5.9, 0, 1.2, 1], // behind-right
  [232, 4, 4.8, 0, 0, 0], [238.5, 3.2, 3.5, 0, 0, 0] // behind-left
]
const BACK: number[][] = [[-35, 3.4, 2.4], [44, 3.6, 3.4], [153, 3.4, 3.2], [235, 3.8, 3]]

export function skylineTowers(): Tower[] {
  const out: Tower[] = []
  for (const f of FRONT) out.push({az: f[0], w: f[1], top: f[2], back: false, step: f[3], spire: f[4], beacon: f[5] === 1})
  for (const b of BACK) out.push({az: b[0], w: b[1], top: b[2], back: true, step: 0, spire: 0, beacon: false})
  return out
}

/** Highest painted elevation of a tower, spire included (degrees). */
export function towerTotal(t: Tower): number { return t.top + t.step + t.spire }

const wrap = (d: number): number => ((d + 180) % 360 + 360) % 360 - 180

/** Silhouette height of one row at an azimuth (degrees): -99 where there is no tower. */
function heightAt(towers: Tower[], back: boolean, az: number): number {
  let h = -99
  for (const t of towers) {
    if (t.back !== back) continue
    const d = Math.abs(wrap(az - t.az))
    if (d > t.w / 2) continue
    let y = t.top
    if (t.step > 0 && d <= t.w * 0.3) y += t.step
    if (t.spire > 0 && d <= 0.14) y = t.top + t.step + t.spire
    h = Math.max(h, y)
  }
  return h
}

export function hash01(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647 + 1274126177) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

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
const colAz = (x: number): number => (x / TEX_W) * 360 // texture column -> azimuth, degrees

/** The silhouette texture as RGBA8 bytes (TEX_W x TEX_H). Row 0 is the bottom. Alpha is the skyline mask; nothing is black. */
export function paintSkyline(towers: Tower[]): Uint8Array {
  const data = new Uint8Array(TEX_W * TEX_H * 4)
  const TF = tone(COL_FRONT), TB = tone(COL_BACK), TH = tone(COL_HAZE)
  const SS = 3 // horizontal sub-samples for soft vertical edges
  const hF = new Float32Array(SS), hB = new Float32Array(SS)
  const rowEl: number[] = [], rowD: number[] = []
  for (let r = 0; r < TEX_H; r++) {
    rowEl.push(rowElevation(r))
    rowD.push(rowElevation(r + 0.5) - rowElevation(r - 0.5)) // degrees per row
  }
  for (let x = 0; x < TEX_W; x++) {
    for (let s = 0; s < SS; s++) {
      const az = colAz(x + (s + 0.5) / SS)
      hF[s] = heightAt(towers, false, az)
      hB[s] = heightAt(towers, true, az)
    }
    for (let r = 0; r < TEX_H; r++) {
      const el = rowEl[r], dEl = rowD[r]
      let cf = 0, cb = 0
      for (let s = 0; s < SS; s++) {
        cf += clamp01((hF[s] - el) / dEl + 0.5)
        cb += clamp01((hB[s] - el) / dEl + 0.5)
      }
      cf /= SS; cb /= SS
      const fade = smooth(-1.9, 1.2, el) // soft gradient into the horizon haze toward the bottom
      const haze = (1 - smooth(-1.4, 2.4, el)) * 0.6
      const colF = [lerp(TF[0], TH[0], haze), lerp(TF[1], TH[1], haze), lerp(TF[2], TH[2], haze)]
      const colB = [lerp(TB[0], TH[0], haze), lerp(TB[1], TH[1], haze), lerp(TB[2], TH[2], haze)]
      const a = cf + cb * (1 - cf)
      let c = a > 0 ? [0, 1, 2].map((k) => (cf * colF[k] + (1 - cf) * cb * colB[k]) / a) : colF
      // sparse light specks: single texels on the front towers (about 6.5% of them, irregular, no grid), dimmer near the haze
      if (cf > 0.98 && el > -0.2 && hash01(x, r, 17) < LIT_FRACTION) {
        const l = LIT[hash01(r, x, 5) < 0.6 ? 0 : 1]
        const k = 0.55 + 0.45 * smooth(-0.2, 2.5, el)
        c = [lerp(c[0], l[0], k), lerp(c[1], l[1], k), lerp(c[2], l[2], k)]
      }
      const o = (r * TEX_W + x) * 4
      data[o] = Math.round(255 * clamp01(c[0])); data[o + 1] = Math.round(255 * clamp01(c[1])); data[o + 2] = Math.round(255 * clamp01(c[2]))
      data[o + 3] = Math.round(255 * clamp01(a * fade))
    }
  }
  // red beacons: a 3 x 3 texel light on the tip of each spire / antenna
  for (const t of towers) {
    if (!t.beacon) continue
    const cx = Math.round((t.az / 360) * TEX_W - 0.5), cy = Math.round(elevationRow(towerTotal(t)))
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = (cx + dx + TEX_W) % TEX_W, y = cy + dy
        if (y < 0 || y >= TEX_H) continue
        const o = (y * TEX_W + x) * 4
        const k = dx === 0 && dy === 0 ? 1 : 0.75
        data[o] = Math.round(255 * RED[0] * k); data[o + 1] = Math.round(255 * RED[1] * k); data[o + 2] = Math.round(255 * RED[2] * k); data[o + 3] = 255
      }
    }
  }
  return data
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
