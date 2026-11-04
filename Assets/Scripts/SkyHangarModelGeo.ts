// SkyHangarModelGeo.ts
// Owns: pure procedural geometry (plain numbers, no Lens globals) for the Hangar / held / card models.
// A GeoBuilder lofts rounded cross-sections along a path (fuselages, wings, nacelles, booms, fins) and adds
// oriented boxes and discs. "Vertex colour" is baked as a palette-slot + shade coordinate in the UVs: u picks
// one of PALETTE_SLOTS colours, v picks a light(top) .. dark(belly) shade from the surface normal, so one
// textured material colours the whole model with top-lit shading.
// Units are span fractions (wingspan / rotor diameter / panel tip-to-tip = 1); models face -Z, +Y up.
// Expects: nothing. Must not: touch the scene or any Lens API.

export type V = [number, number, number]

/** Palette slots shared by every model (the factory fills them from the livery / kind colours). PRIMARY = upper body, SECONDARY = tail fin (helicopters: stripe), BELLY = lower body, ACCENT = cheatline / tail decals, NACELLE / WINGLET / REAR / WING = coloured parts. */
export const SLOT = {PRIMARY: 0, SECONDARY: 1, GLASS: 2, METAL: 3, DARK: 4, FOIL: 5, WHITE: 6, CELL: 7, CLEAR: 8, GRID: 9, BELLY: 10, ACCENT: 11, NACELLE: 12, WINGLET: 13, REAR: 14, WING: 15}
export const PALETTE_SLOTS = 16
/** Palette texture layout: PALETTE_SLOTS cells of CELL_PX wide, GRAD_PX shade rows. */
export const CELL_PX = 8
export const GRAD_PX = 16
/** Shade multiplier (belly .. top) applied by the palette texture. */
export const SHADE_BELLY = 0.76
export const SHADE_TOP = 1.06

const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V): number => Math.sqrt(dot(a, a))
const norm = (a: V): V => {
  const l = len(a)
  return l < 1e-12 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l]
}
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x))

export const X: V = [1, 0, 0]
export const Y: V = [0, 1, 0]
export const Z: V = [0, 0, 1]

/** One cross-section: centre, two in-plane unit axes, radii along them (rv2 = lower half radius along -v). */
export interface Sec {c: V; u: V; v: V; ru: number; rv: number; rv2?: number; /** Super-ellipse exponent of the loft this section belongs to (2 = ellipse). */ n?: number}

export interface LoftOpts {
  sides?: number
  /** Super-ellipse exponent: 2 = ellipse, >2 = boxier. */
  n?: number
  /** Palette slot per row (between ring i and i+1); falls back to `slot`. */
  rowSlots?: number[]
  /** Cap slot at the first / last ring, or -1 for open. */
  capStart?: number
  capEnd?: number
  /** Palette slot per side quad (row i between rings i and i+1, quad j between ring points j and j+1): lets a ring change colour round its circumference. */
  quadSlot?: (i: number, j: number) => number
}

export class GeoBuilder {
  pos: number[] = []
  nrm: number[] = []
  uv: number[] = []
  idx: number[] = []

  get tris(): number { return this.idx.length / 3 }
  get verts(): number { return this.pos.length / 3 }

  private vtx(p: V, n: V, slot: number): number {
    const s = clamp(0.5 + 0.5 * n[1], 0, 1)
    this.pos.push(p[0], p[1], p[2])
    this.nrm.push(n[0], n[1], n[2])
    this.uv.push((slot * CELL_PX + CELL_PX / 2) / (PALETTE_SLOTS * CELL_PX), (0.5 + s * (GRAD_PX - 1)) / GRAD_PX)
    return this.pos.length / 3 - 1
  }

  private p(i: number): V { return [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]] }
  private n(i: number): V { return [this.nrm[i * 3], this.nrm[i * 3 + 1], this.nrm[i * 3 + 2]] }

  /** Triangle wound counter-clockwise as seen from the side the vertex normals face. */
  private tri(a: number, b: number, c: number): void {
    const pa = this.p(a), pb = this.p(b), pc = this.p(c)
    const fn = cross(sub(pb, pa), sub(pc, pa))
    if (len(fn) < 1e-10) return
    const nn = add(add(this.n(a), this.n(b)), this.n(c))
    if (dot(fn, nn) < 0) this.idx.push(a, c, b)
    else this.idx.push(a, b, c)
  }

  private ringPoint(s: Sec, a: number, n: number, k: number): V {
    const ca = Math.cos(a), sa = Math.sin(a)
    const cx = Math.sign(ca) * Math.pow(Math.abs(ca), k)
    const sy = Math.sign(sa) * Math.pow(Math.abs(sa), k)
    const rv = sy >= 0 ? s.rv : s.rv2 !== undefined ? s.rv2 : s.rv
    return add(s.c, add(mul(s.u, cx * s.ru), mul(s.v, sy * rv)))
  }

  /** Point on the surface of a section at angle `a` (radians from +u toward +v), pushed out by `lift`. Follows the section's super-ellipse. */
  static surfacePoint(s: Sec, a: number, lift: number = 1): V {
    const k = 2 / (s.n ?? 2)
    const ca = Math.cos(a), sa = Math.sin(a)
    const cx = Math.sign(ca) * Math.pow(Math.abs(ca), k), sy = Math.sign(sa) * Math.pow(Math.abs(sa), k)
    const rv = sa >= 0 ? s.rv : s.rv2 !== undefined ? s.rv2 : s.rv
    return add(s.c, add(mul(s.u, cx * s.ru * lift), mul(s.v, sy * rv * lift)))
  }

  /** Outward normal of the section's super-ellipse at angle `a`. */
  static surfaceNormal(s: Sec, a: number): V {
    const nExp = s.n ?? 2
    const k = 2 / nExp
    const ca = Math.cos(a), sa = Math.sin(a)
    const cx = Math.sign(ca) * Math.pow(Math.abs(ca), k), sy = Math.sign(sa) * Math.pow(Math.abs(sa), k)
    const rv = sa >= 0 ? s.rv : s.rv2 !== undefined ? s.rv2 : s.rv
    const gx = Math.sign(cx) * Math.pow(Math.abs(cx), nExp - 1) / Math.max(s.ru, 1e-6)
    const gy = Math.sign(sy) * Math.pow(Math.abs(sy), nExp - 1) / Math.max(rv, 1e-6)
    return norm(add(mul(s.u, gx), mul(s.v, gy)))
  }

  loft(secs: Sec[], slot: number, o: LoftOpts = {}): void {
    const sides = o.sides ?? 12
    const k = 2 / (o.n ?? 2)
    const nR = secs.length
    if (nR < 2) return
    const P: V[][] = secs.map((s) => {
      const ring: V[] = []
      for (let j = 0; j < sides; j++) ring.push(this.ringPoint(s, (j / sides) * Math.PI * 2, sides, k))
      return ring
    })
    const N: V[][] = P.map((ring, i) => ring.map((pt, j) => {
      const tr = sub(ring[(j + 1) % sides], ring[(j - 1 + sides) % sides])
      const ta = sub(P[Math.min(i + 1, nR - 1)][j], P[Math.max(i - 1, 0)][j])
      let nn = cross(tr, ta)
      const out = sub(pt, secs[i].c)
      const axial = i === 0 ? sub(secs[0].c, secs[1].c) : i === nR - 1 ? sub(secs[nR - 1].c, secs[nR - 2].c) : sub(secs[i + 1].c, secs[i - 1].c)
      if (len(nn) < 1e-9 || len(out) < 1e-7) return norm(i === 0 ? axial : i === nR - 1 ? axial : out)
      nn = norm(nn)
      return dot(nn, out) < 0 ? mul(nn, -1) : nn
    }))
    for (let i = 0; i < nR - 1; i++) {
      const sl = o.rowSlots && o.rowSlots[i] !== undefined ? o.rowSlots[i] : slot
      if (o.quadSlot && !(o.rowSlots && o.rowSlots[i] !== undefined)) {
        const m0 = new Map<number, number>(), m1 = new Map<number, number>()
        const get = (m: Map<number, number>, ring: number, jj: number, sq: number): number => {
          const key = jj * 64 + sq
          let id = m.get(key)
          if (id === undefined) { id = this.vtx(P[ring][jj], N[ring][jj], sq); m.set(key, id) }
          return id
        }
        for (let j = 0; j < sides; j++) {
          const j1 = (j + 1) % sides, sq = o.quadSlot(i, j)
          this.tri(get(m0, i, j, sq), get(m0, i, j1, sq), get(m1, i + 1, j1, sq))
          this.tri(get(m0, i, j, sq), get(m1, i + 1, j1, sq), get(m1, i + 1, j, sq))
        }
        continue
      }
      const a0: number[] = [], a1: number[] = []
      for (let j = 0; j < sides; j++) {
        a0.push(this.vtx(P[i][j], N[i][j], sl))
        a1.push(this.vtx(P[i + 1][j], N[i + 1][j], sl))
      }
      for (let j = 0; j < sides; j++) {
        const j1 = (j + 1) % sides
        this.tri(a0[j], a0[j1], a1[j1])
        this.tri(a0[j], a1[j1], a1[j])
      }
    }
    const cap = (i: number, sl: number, axial: V) => {
      const ctr = this.vtx(secs[i].c, axial, sl)
      const ring: number[] = []
      for (let j = 0; j < sides; j++) ring.push(this.vtx(P[i][j], axial, sl))
      for (let j = 0; j < sides; j++) this.tri(ctr, ring[j], ring[(j + 1) % sides])
    }
    if (o.capStart !== undefined && o.capStart >= 0) cap(0, o.capStart, norm(sub(secs[0].c, secs[1].c)))
    if (o.capEnd !== undefined && o.capEnd >= 0) cap(nR - 1, o.capEnd, norm(sub(secs[nR - 1].c, secs[nR - 2].c)))
  }

  /** Grid of surface points (rows x cols) with per-point normals, single slot. */
  grid(pts: V[][], nrms: V[][], slot: number): void {
    const ids = pts.map((row, r) => row.map((p, c) => this.vtx(p, nrms[r][c], slot)))
    for (let r = 0; r < pts.length - 1; r++) {
      for (let c = 0; c < pts[r].length - 1; c++) {
        this.tri(ids[r][c], ids[r][c + 1], ids[r + 1][c + 1])
        this.tri(ids[r][c], ids[r + 1][c + 1], ids[r + 1][c])
      }
    }
  }

  /** Box from a centre and three half-extent vectors (any orientation); flat shaded. */
  obox(c: V, ax: V, ay: V, az: V, slot: number): void {
    const axes = [ax, ay, az]
    for (let k = 0; k < 3; k++) {
      const B = axes[(k + 1) % 3], C = axes[(k + 2) % 3]
      for (const sg of [-1, 1]) {
        const ctr = add(c, mul(axes[k], sg))
        const n = mul(norm(axes[k]), sg)
        const q = [sub(sub(ctr, B), C), sub(add(ctr, B), C), add(add(ctr, B), C), add(sub(ctr, B), C)]
        const id = q.map((p) => this.vtx(p, n, slot))
        this.tri(id[0], id[1], id[2])
        this.tri(id[0], id[2], id[3])
      }
    }
  }

  /** Axis-aligned box helper. */
  box(c: V, hx: number, hy: number, hz: number, slot: number): void {
    this.obox(c, [hx, 0, 0], [0, hy, 0], [0, 0, hz], slot)
  }

  /** Flat disc facing `n`. */
  disc(c: V, n: V, radius: number, slot: number, sides: number = 12): void {
    const nn = norm(n)
    const f = frame(nn)
    const ctr = this.vtx(c, nn, slot)
    const ring: number[] = []
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2
      ring.push(this.vtx(add(c, add(mul(f.u, Math.cos(a) * radius), mul(f.v, Math.sin(a) * radius))), nn, slot))
    }
    for (let j = 0; j < sides; j++) this.tri(ctr, ring[j], ring[(j + 1) % sides])
  }

  /** Round tube between two points, radius r0 -> r1. */
  tube(p0: V, p1: V, r0: number, r1: number, slot: number, sides: number = 8, capEnds: number = -1): void {
    const f = frame(norm(sub(p1, p0)))
    this.loft([
      {c: p0, u: f.u, v: f.v, ru: r0, rv: r0},
      {c: p1, u: f.u, v: f.v, ru: r1, rv: r1}
    ], slot, {sides, capStart: capEnds, capEnd: capEnds})
  }

  /** Move / scale everything (final fit). */
  transform(scale: number, offset: V = [0, 0, 0]): void {
    for (let i = 0; i < this.pos.length; i += 3) {
      this.pos[i] = this.pos[i] * scale + offset[0]
      this.pos[i + 1] = this.pos[i + 1] * scale + offset[1]
      this.pos[i + 2] = this.pos[i + 2] * scale + offset[2]
    }
  }

  /** Interleaved position(3) normal(3) uv(2), the layout MeshBuilder wants. */
  interleaved(): number[] {
    const out: number[] = []
    for (let i = 0; i < this.pos.length / 3; i++) {
      out.push(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2], this.nrm[i * 3], this.nrm[i * 3 + 1], this.nrm[i * 3 + 2], this.uv[i * 2], this.uv[i * 2 + 1])
    }
    return out
  }
}

/** Two unit vectors perpendicular to `w`. */
export function frame(w: V): {u: V; v: V} {
  const ref: V = Math.abs(w[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u = norm(cross(ref, w))
  return {u, v: norm(cross(w, u))}
}

// ---------------------------------------------------------------------------------------------------------------
// Model descriptions
// ---------------------------------------------------------------------------------------------------------------

export type SpinAxis = "y" | "x" | "z"

/** A separately spinning mesh (rotor, propeller, tail rotor) around a pivot. */
export interface SpinPart {
  name: string
  geo: GeoBuilder
  pivot: V
  axis: SpinAxis
  /** Rate relative to the base rev/s passed by the caller (negative = counter-rotating). */
  rate: number
  role: "main" | "tail" | "other"
  /** Radius of a faint motion-blur disc shown at speed (rotors), 0 = none. */
  blurR?: number
}

export interface ModelGeo {
  body: GeoBuilder
  spins: SpinPart[]
  /** Slow constant spin of the whole body (satellites). */
  bodySpin: boolean
  /** Airliner passenger windows in model space (span fractions): side 0 = +X, 1 = -X; u = fraction of fuselage length from the nose. */
  windows?: {side: number; u: number; c: V; row: string}[]
  /** Airliner fuselage in model space: length, diameter, nose-tip z (cockpit / window placement checks). */
  fus?: {L: number; D: number; zNose: number}
  /** Airliner windscreen glass: triangle ranges (into body.idx / 3) of each of the 6 panels. */
  windscreen?: {tri0: number; tri1: number}[]
  /** Helicopter glass: gap between the glass skin and the body skin, per glazing kind (model space) - must be > 0 and small. */
  glazing?: {kind: string; minGap: number; maxGap: number; panels: number; inward: number}[]
}

/** Structural livery options (colours come from the palette): decal geometry that differs between liveries. */
export interface LiveryGeo {
  /** Cheatline under the windows: 0 none, 1 thin, 2 thick. */
  cheat: 0 | 1 | 2
  /** Two-tone hull: BELLY colour below the midline. */
  split: boolean
  /** Wide accent band along the belly. */
  belly: boolean
  tailDeco: "none" | "diag" | "swoosh" | "tip" | "band"
  /** Rear fuselage block in the REAR colour. */
  rear: boolean
  /** Helicopters: side stripe along the cabin in the SECONDARY colour. */
  stripe: boolean
}
export const PLAIN_LIVERY: LiveryGeo = {cheat: 1, split: false, belly: false, tailDeco: "none", rear: false, stripe: false}

export type AirlinerFamily = "narrowbody" | "widebody" | "largeWidebody" | "jumbo" | "superjumbo" | "regional" | "turboprop" | "bizSmall" | "bizLarge"
export type HeliFamily = "lightPiston" | "lightTurbine" | "mediumTwin" | "largeTransport" | "tandem"
export type SatFamily = "cubesat" | "comms" | "flatpanel" | "station"
export type ModelFamily = AirlinerFamily | HeliFamily | SatFamily

const mk = (c: V, u: V, v: V, ru: number, rv: number, rv2?: number): Sec => ({c, u, v, ru, rv, rv2})

// ---------- airliners ----------
// Everything is authored with fuselage length L = 1 and scaled at the end so the wingspan (about 0.95 L) fits the model span.
interface AirP {
  D: number; tail: number; deck: 0 | 1 | 2; deckH: number
  wingMid: number; root: number; tip: number; sweepDeg: number; dih: number; high: boolean
  winglet: 0 | 1 | 2
  eng: "wing" | "tail" | "prop"
  engFrac: number[]; engD: number; engOuterK: number
  stabHalf: number; stabRoot: number; stabTip: number; tTail: boolean
  ovals: number; scale: number
}

const TAN = (deg: number) => Math.tan((deg * Math.PI) / 180)

const AIR: {[f: string]: AirP} = {
  narrowbody: {D: 1 / 9.5, tail: 0.27, deck: 0, deckH: 0, wingMid: 0.46, root: 0.125, tip: 0.031, sweepDeg: 28, dih: 0.014, high: false, winglet: 1,
    eng: "wing", engFrac: [0.35], engD: 0.45, engOuterK: 1, stabHalf: 0.18, stabRoot: 0.08, stabTip: 0.03, tTail: false, ovals: 0, scale: 0.97},
  widebody: {D: 1 / 8, tail: 0.27, deck: 0, deckH: 0, wingMid: 0.46, root: 0.135, tip: 0.034, sweepDeg: 31, dih: 0.022, high: false, winglet: 2,
    eng: "wing", engFrac: [0.35], engD: 0.48, engOuterK: 1, stabHalf: 0.18, stabRoot: 0.085, stabTip: 0.032, tTail: false, ovals: 0, scale: 1},
  largeWidebody: {D: 1 / 8.2, tail: 0.28, deck: 0, deckH: 0, wingMid: 0.47, root: 0.14, tip: 0.035, sweepDeg: 31, dih: 0.018, high: false, winglet: 2,
    eng: "wing", engFrac: [0.35], engD: 0.48, engOuterK: 1, stabHalf: 0.185, stabRoot: 0.09, stabTip: 0.033, tTail: false, ovals: 0, scale: 1},
  jumbo: {D: 1 / 8.2, tail: 0.27, deck: 1, deckH: 0.34, wingMid: 0.47, root: 0.14, tip: 0.035, sweepDeg: 35, dih: 0.02, high: false, winglet: 1,
    eng: "wing", engFrac: [0.32, 0.62], engD: 0.45, engOuterK: 0.92, stabHalf: 0.185, stabRoot: 0.09, stabTip: 0.033, tTail: false, ovals: 0, scale: 1},
  superjumbo: {D: 1 / 8.4, tail: 0.26, deck: 2, deckH: 0.4, wingMid: 0.46, root: 0.145, tip: 0.036, sweepDeg: 33, dih: 0.02, high: false, winglet: 1,
    eng: "wing", engFrac: [0.32, 0.62], engD: 0.45, engOuterK: 0.92, stabHalf: 0.185, stabRoot: 0.09, stabTip: 0.033, tTail: false, ovals: 0, scale: 1},
  regional: {D: 1 / 9, tail: 0.28, deck: 0, deckH: 0, wingMid: 0.46, root: 0.115, tip: 0.03, sweepDeg: 25, dih: 0.012, high: false, winglet: 1,
    eng: "tail", engFrac: [], engD: 0.45, engOuterK: 1, stabHalf: 0.16, stabRoot: 0.08, stabTip: 0.035, tTail: true, ovals: 0, scale: 0.9},
  turboprop: {D: 1 / 9.5, tail: 0.3, deck: 0, deckH: 0, wingMid: 0.45, root: 0.105, tip: 0.065, sweepDeg: 4, dih: 0.0, high: true, winglet: 0,
    eng: "prop", engFrac: [0.3], engD: 0.45, engOuterK: 1, stabHalf: 0.17, stabRoot: 0.085, stabTip: 0.045, tTail: true, ovals: 0, scale: 0.9},
  bizSmall: {D: 1 / 8.2, tail: 0.3, deck: 0, deckH: 0, wingMid: 0.5, root: 0.125, tip: 0.04, sweepDeg: 30, dih: 0.025, high: false, winglet: 0,
    eng: "tail", engFrac: [], engD: 0.45, engOuterK: 1, stabHalf: 0.17, stabRoot: 0.085, stabTip: 0.035, tTail: true, ovals: 6, scale: 0.72},
  bizLarge: {D: 1 / 9.8, tail: 0.3, deck: 0, deckH: 0, wingMid: 0.5, root: 0.13, tip: 0.035, sweepDeg: 33, dih: 0.02, high: false, winglet: 1,
    eng: "tail", engFrac: [], engD: 0.45, engOuterK: 1, stabHalf: 0.17, stabRoot: 0.085, stabTip: 0.03, tTail: true, ovals: 9, scale: 0.85}
}

/** Engine pod along +z from its front centre: forward lip, body, taper, dark intake face with a lighter inner ring. */
function nacelle(g: GeoBuilder, c: V, R: number, L: number, bodySlot: number, lipSlot: number, sides: number = 12): void {
  const st: [number, number][] = [[0, 1.0], [0.06, 1.07], [0.28, 1.02], [0.65, 0.94], [0.9, 0.66], [1, 0.5]]
  const secs = st.map(([t, r]) => mk([c[0], c[1], c[2] + t * L], X, Y, R * r, R * r))
  g.loft(secs, bodySlot, {sides, rowSlots: [lipSlot, bodySlot, bodySlot, bodySlot, SLOT.METAL], capEnd: SLOT.DARK})
  // fan face: light lip ring, dark fan disc, light hub ring and a spinner cone (each step 0.0012 closer to the viewer)
  const z0 = c[2] + L * 0.06
  g.disc([c[0], c[1], z0], [0, 0, -1], R * 0.92, SLOT.METAL, sides)
  g.disc([c[0], c[1], z0 - 0.0012], [0, 0, -1], R * 0.72, SLOT.DARK, sides)
  g.disc([c[0], c[1], z0 - 0.0024], [0, 0, -1], R * 0.3, SLOT.METAL, sides)
  g.loft([mk([c[0], c[1], z0 - 0.0024 - R * 0.55], X, Y, 0.0004, 0.0004), mk([c[0], c[1], z0 - 0.0024 - R * 0.2], X, Y, R * 0.2, R * 0.2), mk([c[0], c[1], z0 - 0.0024], X, Y, R * 0.3, R * 0.3)], SLOT.WHITE, {sides: 8})
}

/** Lofted lifting surface along +x or -x (sgn). Returns the tip station for winglets. */
function surface(g: GeoBuilder, sgn: number, x0: number, x1: number, y0: number, dih: number, zLE0: number, sweep: number, root: number, tip: number, th: number, slot: number, taperTh: number = 0.55): {c: V; chord: number} {
  const ts = [0, 0.4, 1]
  const secs: Sec[] = ts.map((t) => {
    const chord = lerp(root, tip, t)
    const zc = zLE0 + sweep * t + chord / 2
    return mk([sgn * lerp(x0, x1, t), y0 + dih * t, zc], Z, Y, chord / 2, (th / 2) * lerp(1, taperTh, t))
  })
  const last = secs[2]
  const tipX = last.c[0], tipC = last.ru
  for (const [d, k] of [[0.004, 0.6], [0.0075, 0.18]] as [number, number][]) {
    secs.push(mk([tipX + sgn * d, last.c[1], last.c[2]], Z, Y, tipC * k, last.rv * k))
  }
  g.loft(secs, slot, {sides: 6})
  return {c: last.c, chord: tipC * 2}
}

function winglet(g: GeoBuilder, sgn: number, tipc: V, chord: number, kind: 1 | 2, slot: number): void {
  const h = kind === 1 ? 0.05 : 0.026
  const out = kind === 1 ? 0.012 : 0.03
  const back = kind === 1 ? 0.035 : 0.045
  const secs = [
    mk(tipc, Z, X, chord / 2, 0.0028),
    mk([tipc[0] + sgn * out * 0.5, tipc[1] + h * 0.55, tipc[2] + back * 0.45], Z, X, chord * 0.32, 0.0024),
    mk([tipc[0] + sgn * out, tipc[1] + h, tipc[2] + back], Z, X, chord * 0.14, 0.002)
  ]
  g.loft(secs, slot, {sides: 6, capEnd: slot})
}

// Half-span as a fraction of fuselage length: short-winged regionals / bizjets, long-winged big twins.
const SEMI: {[f: string]: number} = {narrowbody: 0.485, widebody: 0.475, largeWidebody: 0.485, jumbo: 0.485, superjumbo: 0.5, regional: 0.39, turboprop: 0.46, bizSmall: 0.36, bizLarge: 0.42}

/** Airliner nose radius ratio r/R by t (distance from the nose start / nose length): 1 at the barrel, a small rounded cap (0.05 R) at the tip. */
export const NOSE_PROFILE: [number, number][] = [[0, 1], [0.1, 0.985], [0.2, 0.95], [0.3, 0.89], [0.4, 0.81], [0.5, 0.71], [0.6, 0.6], [0.7, 0.47], [0.8, 0.34], [0.9, 0.19], [0.97, 0.08], [0.99, 0.065], [1, 0.05]]
/** Rings along the nose (t values): the knots plus midpoints, 24 rings. */
export const NOSE_RING_T = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.94, 0.97, 0.985, 0.995, 1]

/** Monotone cubic (Fritsch-Carlson) through NOSE_PROFILE: smooth, no overshoot, so the nose never bulges or kinks. */
export function noseRadiusRatio(t: number): number {
  const K = NOSE_PROFILE, n = K.length
  const x = clamp(t, 0, 1)
  const d: number[] = [], m: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((K[i + 1][1] - K[i][1]) / (K[i + 1][0] - K[i][0]))
  m.push(d[0])
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2)
  m.push(d[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b
    if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i] }
  }
  let i = 0
  while (i < n - 2 && x > K[i + 1][0]) i++
  const h = K[i + 1][0] - K[i][0], s = (x - K[i][0]) / h
  const s2 = s * s, s3 = s2 * s
  return (2 * s3 - 3 * s2 + 1) * K[i][1] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * K[i + 1][1] + (s3 - s2) * h * m[i + 1]
}

function airlinerGeo(fam: string, lg: LiveryGeo): ModelGeo {
  const P = AIR[fam]
  const g = new GeoBuilder()
  const D = P.D, R = D / 2
  // Nose: a surface of revolution about the fuselage centreline (no droop). Length Ln: 1.4 D airliners, 1.5 D regional / business jets, 0.9 D turboprop.
  // t = distance from the nose start (barrel junction) / Ln; radius ratio r/R follows NOSE_PROFILE (monotone cubic between the knots), ending in a small rounded cap.
  const slim = fam === "regional" || fam === "bizSmall" || fam === "bizLarge"
  const nose = (slim ? 1.5 : fam === "turboprop" ? 0.9 : 1.4) * D
  const zAt = (u: number) => -0.5 + u
  const tailStart = 1 - P.tail
  const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
  const noseR = (t: number) => noseRadiusRatio(t)
  const prof = (u: number): {f: number; cy: number; top: number} => {
    let f = 1, cy = 0
    if (u < nose) {
      f = noseR((nose - u) / nose)
    } else if (u > tailStart) {
      const s = (u - tailStart) / P.tail
      f = 1 - 0.88 * Math.pow(s, 1.2)
      cy = 0.3 * D * Math.pow(s, 1.7)
    }
    let top = 0
    if (P.deck === 1) top = P.deckH * D * Math.pow(Math.sin(Math.PI * Math.pow(clamp((u - 0.2) / 0.3, 0, 1), 0.72)), 1.1)
    else if (P.deck === 2) top = P.deckH * D * smooth(0.2, 0.3, u) * (1 - smooth(0.74, 0.9, u))
    return {f, cy, top}
  }
  // The nose is a plain circle on the centreline; the barrel eases into its slightly deeper belly over the first diameter behind the junction.
  const fusSec = (u: number): Sec => {
    const p = prof(u)
    const r = R * Math.max(p.f, 0.04)
    if (u <= nose) return mk([0, 0, zAt(u)], X, Y, r, r)
    const k = smooth(nose, nose + D, u)
    return mk([0, p.cy, zAt(u)], X, Y, r, r * (1 + 0.02 * k) + p.top * Math.min(1, p.f * 1.4), r * (1 - 0.04 * k))
  }
  const us: number[] = []
  for (const t of NOSE_RING_T) us.push(nose * (1 - t))
  if (P.deck) for (const u of [0.22, 0.27, 0.32, 0.38, 0.45, 0.55, 0.65, 0.75, 0.85]) us.push(u)
  us.push(nose + 0.5 * D, nose + D, (nose + tailStart) / 2, tailStart)
  for (const s of [0.2, 0.42, 0.65, 0.85, 1]) us.push(tailStart + s * P.tail)
  us.sort((a, b) => a - b)
  const uniq = us.filter((u, i) => i === 0 || u - us[i - 1] > 1e-4)
  // Livery colours round the hull: upper body, a lower (belly) colour below -30 deg when the livery is two-tone, and a coloured rear fuselage block.
  const SIDES = 24
  const rearU = tailStart + 0.4 * P.tail
  const quadSlot = (i: number, j: number): number => {
    if (lg.rear && (uniq[i] + uniq[i + 1]) / 2 >= rearU) return SLOT.REAR
    const mid = (j + 0.5) / SIDES * 360
    return lg.split && mid > 210 && mid < 330 ? SLOT.BELLY : SLOT.PRIMARY
  }
  g.loft(uniq.map(fusSec), SLOT.PRIMARY, {sides: SIDES, capStart: SLOT.METAL, capEnd: lg.rear ? SLOT.REAR : SLOT.PRIMARY, rowSlots: [SLOT.METAL], quadSlot}) // first row = the tiny radome cap

  // surface patches ride on the fuselage; `rows` give (u, angle range) so a patch can slope
  const patch = (rows: [number, number, number][], cols: number, slot: number, lift: number) => {
    const pts: V[][] = [], ns: V[][] = []
    for (const [u, a0, a1] of rows) {
      const s = fusSec(u)
      const pr: V[] = [], nr: V[] = []
      for (let c = 0; c <= cols; c++) {
        const a = lerp(a0, a1, c / cols)
        pr.push(GeoBuilder.surfacePoint(s, a, lift))
        nr.push(GeoBuilder.surfaceNormal(s, a))
      }
      pts.push(pr); ns.push(nr)
    }
    g.grid(pts, ns, slot)
  }
  const strip = (u0: number, u1: number, a0: number, a1: number, slot: number, lift: number, n: number) => {
    const rows: [number, number, number][] = []
    for (let i = 0; i <= n; i++) rows.push([lerp(u0, u1, i / n), a0, a1])
    patch(rows, 1, slot, lift)
  }

  const DEG2 = Math.PI / 180
  const sideA = (side: number, a: number) => (side === 0 ? a : Math.PI - a)
  const f2 = sideA
  // Windscreen: a WIDE, SHORT dark band across the upper nose. In the front projection it is the rectangle |x| <= 0.55 R, 0.15 R .. 0.43 R above the axis; a
  // 14 x 3 grid of points is ray cast along the forward axis onto the nose surface of revolution (r = hypot(x, y)) and pushed 0.003 out along the normal.
  // One dark material, no frames, no pillar.
  const WS_OFF = 0.003
  const skin = (u: number, a: number, off: number): {p: V; n: V} => {
    const s0 = fusSec(u)
    const n = GeoBuilder.surfaceNormal(s0, a)
    return {p: add(GeoBuilder.surfacePoint(s0, a, 1), mul(n, off)), n}
  }
  const tAtRadius = (rho: number): number => { let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (noseR(m) > rho) lo = m; else hi = m } return (lo + hi) / 2 }
  const windscreen: {tri0: number; tri1: number}[] = []
  {
    const t0 = g.tris
    const pts: V[][] = [], ns: V[][] = [], rows = 3, cols = 14
    for (let r = 0; r <= rows; r++) {
      const y = lerp(0.19, 0.39, r / rows) * R
      const row: V[] = [], nr: V[] = []
      for (let c = 0; c <= cols; c++) {
        const x = lerp(-0.55, 0.55, c / cols) * R
        const u = nose * (1 - tAtRadius(Math.hypot(x, y) / R))
        const q = skin(u, Math.atan2(y, x), WS_OFF)
        row.push(q.p); nr.push(q.n)
      }
      pts.push(row); ns.push(nr)
    }
    g.grid(pts, ns, SLOT.GLASS)
    windscreen.push({tri0: t0, tri1: g.tris})
  }
  // passenger windows: small round dark discs 1 mm-ish proud, one row per side, 25 deg above the midline, 0.14 L .. 0.80 L from the nose
  const WIN_A = 25 * DEG2
  const winR = 0.035 * D, winPitch = 0.11 * D, winProud = 0.0007
  const doorU = [0.2, 0.75]
  const DOOR_HALF = 0.012 // half-width of the door outline strip
  const winPos: {side: number; u: number; c: V; n: V; row: string}[] = []
  const placeWindow = (side: number, u: number, rad: number) => {
    const s0 = fusSec(u)
    // WIN_A is the physical angle above the horizontal midline; convert to the ellipse parameter (the deck hump makes rv > ru)
    const a = sideA(side, Math.atan2(s0.ru * Math.sin(WIN_A), s0.rv * Math.cos(WIN_A)))
    const n = GeoBuilder.surfaceNormal(s0, a)
    const c = add(GeoBuilder.surfacePoint(s0, a, 1), mul(n, winProud))
    g.disc(c, n, rad, SLOT.GLASS, 6)
    winPos.push({side, u, c, n, row: "main"})
  }
  for (const side of [0, 1]) {
    if (P.ovals > 0) {
      const u0 = doorU[0] + DOOR_HALF + 0.1 * D + 0.004, u1 = 0.62
      for (let i = 0; i < P.ovals; i++) placeWindow(side, u0 + ((u1 - u0) * i) / Math.max(1, P.ovals - 1), 0.1 * D)
    } else {
      const nWin = Math.floor((0.8 - 0.14) / winPitch) + 1
      for (let i = 0; i < nWin; i++) {
        const u = 0.14 + i * winPitch
        if (doorU.some((d) => Math.abs(u - d) < DOOR_HALF + winR + 0.003)) continue // none through a door outline
        placeWindow(side, u, winR)
      }
    }
    // door outlines: thin frame at the front and rear door
    for (const du of doorU) {
      const w = DOOR_HALF, aLo = -12 * DEG2, aHi = 42 * DEG2, t1 = 0.0016, ta = 0.018
      strip(du - w, du + w, f2(side, aLo), f2(side, aLo + ta), SLOT.METAL, 1.02, 1)
      strip(du - w, du + w, f2(side, aHi - ta), f2(side, aHi), SLOT.METAL, 1.02, 1)
      strip(du - w, du - w + t1, f2(side, aLo), f2(side, aHi), SLOT.METAL, 1.02, 1)
      strip(du + w - t1, du + w, f2(side, aLo), f2(side, aHi), SLOT.METAL, 1.02, 1)
    }
    // livery cheatline just under the windows
    if (lg.cheat > 0) strip(1.9 * D, tailStart + P.tail * 0.5, sideA(side, WIN_A - (lg.cheat === 2 ? 0.36 : 0.3)), sideA(side, WIN_A - (lg.cheat === 2 ? 0.12 : 0.17)), SLOT.ACCENT, 1.012, 8)
  }
  // thin belly line
  if (lg.belly) strip(nose + 0.5 * D, tailStart + 0.3 * P.tail, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5, SLOT.ACCENT, 1.012, 8) // belly band
  else strip(nose + 0.5 * D, tailStart, -Math.PI / 2 - 0.05, -Math.PI / 2 + 0.05, SLOT.DARK, 1.012, 6)
  if (P.deck) {
    const ua = P.deck === 2 ? 0.58 : 0.5
    for (const side of [0, 1]) {
      const u0 = P.deck === 2 ? 0.3 : 0.25, u1 = P.deck === 2 ? 0.74 : 0.42
      const dn = Math.floor((u1 - u0) / winPitch)
      for (let i = 0; i < dn; i++) {
        const s0 = fusSec(u0 + i * winPitch)
        const n = GeoBuilder.surfaceNormal(s0, sideA(side, ua))
        g.disc(add(GeoBuilder.surfacePoint(s0, sideA(side, ua), 1), mul(n, winProud)), n, winR, SLOT.GLASS, 6)
        winPos.push({side, u: u0 + i * winPitch, c: add(GeoBuilder.surfacePoint(s0, sideA(side, ua), 1), mul(n, winProud)), n, row: "deck"})
      }
    }
  }

  // --- wings: root chord ~L/8, tip ~25%, swept, dihedral, rounded tips, mounted by wingMid ---
  const wy0 = P.high ? R * 0.78 : -R * 0.5
  const semi = SEMI[fam] ?? 0.475
  const outerLoss = P.winglet ? 0.014 : 0
  const x0 = R * 0.7, tipX = semi - outerLoss - 0.0075
  const th = 0.12 * P.root
  const swp = TAN(P.sweepDeg) * (tipX - x0)
  const zLE0 = zAt(P.wingMid) - P.root / 2
  const wingYAt = (x: number) => wy0 + P.dih * ((x - x0) / (tipX - x0))
  const wingLEAt = (x: number) => zLE0 + swp * ((x - x0) / (tipX - x0))
  const wingHalfThAt = (x: number) => (th / 2) * lerp(1, 0.55, (x - x0) / (tipX - x0))
  for (const sgn of [-1, 1]) {
    const st = surface(g, sgn, x0, tipX, wy0, P.dih, zLE0, swp, P.root, P.tip, th, SLOT.WING)
    if (P.winglet) winglet(g, sgn, st.c, st.chord, P.winglet, SLOT.WINGLET)
    // flap-track fairings: small pods hanging behind the trailing edge
    for (const fr of [0.3, 0.55, 0.78]) {
      const x = x0 + fr * (tipX - x0)
      const chord = lerp(P.root, P.tip, fr)
      const te = wingLEAt(x) + chord
      g.box([sgn * x, wingYAt(x) - wingHalfThAt(x) * 0.6, te + 0.003], 0.0016, 0.0016, 0.0085, SLOT.METAL)
    }
  }
  // wing-root fairing: a flat blister blending the wing into the belly (onto the back for a high wing)
  {
    const fy = P.high ? R * 0.62 : -R * 0.62
    const La = P.root * 0.95
    const secs = [0, 0.18, 0.5, 0.82, 1].map((t) => {
      const e = Math.pow(Math.sin(Math.PI * t), 0.6)
      return mk([0, fy, zAt(P.wingMid) + (t - 0.5) * 2 * La], X, Y, R * (0.1 + 0.88 * e), R * (0.06 + 0.36 * e))
    })
    g.loft(secs, P.high ? SLOT.PRIMARY : SLOT.BELLY, {sides: 12})
  }

  // --- engines ---
  const spins: SpinPart[] = []
  if (P.eng === "wing" || P.eng === "prop") {
    for (const sgn of [-1, 1]) {
      P.engFrac.forEach((fr, i) => {
        const ex = fr * semi
        const eR = (R * 2 * P.engD * (i > 0 ? P.engOuterK : 1)) / 2
        const eL = eR * 3.2
        const wy1 = wingYAt(ex)
        const ey = P.eng === "prop" ? wy1 - wingHalfThAt(ex) - eR * 0.55 : wy1 - wingHalfThAt(ex) - eR * 0.3 - eR * 1.07
        const ez = wingLEAt(ex) - eL * (P.eng === "prop" ? 0.5 : 0.62)
        nacelle(g, [sgn * ex, ey, ez], eR, eL, SLOT.NACELLE, P.eng === "prop" ? SLOT.NACELLE : SLOT.METAL, P.eng === "prop" ? 10 : 12)
        if (P.eng === "wing") {
          const top = ey + eR * 1.05
          const zA = ez + eL * 0.3, zB = wingLEAt(ex) + 0.05
          g.box([sgn * ex, (top + wy1) / 2, (zA + zB) / 2], 0.0045, (wy1 - top) / 2 + 0.0008, (zB - zA) / 2, SLOT.WING)
        } else {
          g.loft([mk([sgn * ex, ey, ez - 0.01], X, Y, 0.003, 0.003), mk([sgn * ex, ey, ez + 0.004], X, Y, eR * 0.8, eR * 0.8), mk([sgn * ex, ey, ez + 0.02], X, Y, eR, eR)], SLOT.METAL, {sides: 8, capStart: SLOT.METAL})
          const pg = new GeoBuilder()
          const bl = 0.68 * D
          for (let b = 0; b < 4; b++) {
            const a = (b / 4) * Math.PI * 2 + 0.4
            const dir: V = [Math.cos(a), Math.sin(a), 0]
            pg.obox(mul(dir, bl * 0.55), mul(dir, bl * 0.45), mul([-dir[1], dir[0], 0], 0.0075), [0, 0, 0.0016], SLOT.DARK)
          }
          pg.loft([mk([0, 0, 0.012], X, Y, 0.0001, 0.0001), mk([0, 0, 0.006], X, Y, 0.012, 0.012), mk([0, 0, -0.006], X, Y, 0.011, 0.011), mk([0, 0, -0.016], X, Y, 0.0018, 0.0018)], SLOT.SECONDARY, {sides: 8})
          spins.push({name: sgn < 0 ? "PropL" : "PropR", geo: pg, pivot: [sgn * ex, ey, ez - 0.02], axis: "z", rate: sgn < 0 ? 1.8 : -1.8, role: "other"})
        }
      })
    }
  } else {
    const eR = (R * 2 * P.engD) / 2, eL = eR * 3.0
    const ez = zAt(tailStart) - eL * 0.2 + P.tail * 0.12
    const ey = fusSec(tailStart + 0.03).c[1] + R * 0.35
    const ex = fusSec(tailStart + 0.03).ru + eR * 1.12 + 0.005
    for (const sgn of [-1, 1]) {
      nacelle(g, [sgn * ex, ey, ez], eR, eL, SLOT.NACELLE, SLOT.METAL, 10)
      g.box([sgn * (ex + R * 0.7) / 2, ey, ez + eL * 0.55], (ex - R * 0.7) / 2 + 0.002, 0.006, eL * 0.3, SLOT.NACELLE)
    }
  }

  // --- tail: fin 1.25 D above the fuselage (1.4 D on the four-engine jumbos), root chord 1.5 D, 35 deg leading-edge sweep, tip chord 0.45 root, rounded tip ---
  const finRoot = 1.5 * D, finTipCh = 0.45 * finRoot
  const finAbove = (P.engFrac.length > 1 ? 1.4 : 1.25) * D
  const tailAt = fusSec(1 - 0.04 - 0.5 * finRoot)
  const finY0 = tailAt.c[1] + tailAt.rv * 0.6
  const finTop = R + finAbove // measured above the barrel crown
  const finRound = 0.2 * finTipCh // height of the rounded tip cap
  const finH = Math.max(0.05, finTop - finY0)
  const finHs = finH - finRound
  const finSw = TAN(35) * finHs
  const finLE = zAt(0.985) - finRoot - finSw * 0.35
  const finThick = (ch: number) => 0.042 * ch
  const finTs = [0, 0.5, 0.82, 1]
  const finSec = (t: number): Sec => {
    const ch = lerp(finRoot, finTipCh, t)
    return mk([0, finY0 + finHs * t, finLE + finSw * t + ch / 2], Z, X, ch / 2, finThick(ch))
  }
  const finSecs: Sec[] = finTs.map(finSec)
  const fl = finSecs[finSecs.length - 1]
  for (const a of [30, 55, 75, 88]) {
    const sn = Math.sin(a * DEG2), cs = Math.cos(a * DEG2)
    finSecs.push(mk([0, fl.c[1] + finRound * sn, fl.c[2]], Z, X, fl.ru * cs, fl.rv * cs))
  }
  // rows: 0 root..0.5, 1 0.5..0.82, 2 0.82..1, then the rounded cap rows; the tip livery colours the last rows
  const finTip = lg.tailDeco === "tip"
  g.loft(finSecs, SLOT.SECONDARY, {sides: 8, capEnd: finTip ? SLOT.ACCENT : SLOT.SECONDARY, rowSlots: finTip ? [SLOT.SECONDARY, SLOT.SECONDARY, SLOT.ACCENT, SLOT.ACCENT, SLOT.ACCENT, SLOT.ACCENT, SLOT.ACCENT] : undefined})
  // fin decals: flat bands lying on both faces of the fin (chord fraction g measured from the leading edge)
  const finDecal = (tOf: (k: number) => number, g0: (t: number) => number, g1: (t: number) => number, rows: number) => {
    for (const side of [1, -1]) {
      const pts: V[][] = [], ns: V[][] = []
      for (let k = 0; k <= rows; k++) {
        const t = tOf(k / rows), sec = finSec(t)
        const row: V[] = [], nr: V[] = []
        for (const gg of [g0(t), g1(t)]) {
          const a = Math.acos(clamp(2 * gg - 1, -1, 1)) * side
          const n = GeoBuilder.surfaceNormal(sec, a)
          row.push(add(GeoBuilder.surfacePoint(sec, a, 1), mul(n, 0.0004))); nr.push(n)
        }
        pts.push(row); ns.push(nr)
      }
      g.grid(pts, ns, SLOT.ACCENT)
    }
  }
  if (lg.tailDeco === "diag") finDecal((k) => lerp(0.04, 0.96, k), (t) => clamp(0.78 - 0.7 * t, 0.03, 0.95), (t) => clamp(1.04 - 0.7 * t, 0.08, 0.99), 10)
  else if (lg.tailDeco === "swoosh") {
    // a curved band that rises from the trailing edge at the root and sweeps to the leading edge halfway up, thinning as it goes
    finDecal((k) => lerp(0.04, 0.62, k), (t) => clamp(0.88 - 1.0 * Math.pow(t / 0.62, 0.8) * 0.7, 0.05, 0.95), (t) => clamp(1.0 - 1.0 * Math.pow(t / 0.62, 0.8) * 0.7 - 0.06 * (1 - t / 0.62), 0.06, 0.99), 12)
  } else if (lg.tailDeco === "band") finDecal((k) => lerp(0.38, 0.56, k), () => 0.04, () => 0.96, 2)
  const stabY = P.tTail ? finTop + 0.001 : tailAt.c[1] + 0.003
  const stabLE = P.tTail ? finLE + finSw - 0.01 : zAt(0.985) - P.stabRoot - TAN(33) * P.stabHalf * 0.3
  for (const sgn of [-1, 1]) surface(g, sgn, 0.004, P.stabHalf, stabY, 0.008, stabLE, TAN(33) * P.stabHalf, P.stabRoot, P.stabTip, 0.012, SLOT.WING)

  // fit: wingspan (~0.95 L) -> model span * scale
  const k = P.scale / (2 * (tipX + outerLoss + 0.0075))
  g.transform(k)
  for (const s of spins) {
    s.geo.transform(k)
    s.pivot = mul(s.pivot, k)
  }
  return {body: g, spins, bodySpin: false, windows: winPos.map((w) => ({side: w.side, u: w.u, c: mul(w.c, k), row: w.row})), fus: {L: k, D: D * k, zNose: zAt(0) * k}, windscreen}
}

// ---------- helicopters ----------
// Authored with the main-rotor diameter = 1. Light helicopters have a rotor ~1.3-1.5x the body length.
function rotorGeo(blades: number, dia: number, chord: number, hubR: number): GeoBuilder {
  const g = new GeoBuilder()
  const DROOP = 0.014 * dia // blade tips hang slightly below the hub plane
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + 0.2
    const dir: V = [Math.cos(a), 0, Math.sin(a)]
    const perp: V = [-dir[2], 0, dir[0]]
    const y = b * 0.0007
    // thin, long blade in two segments; the outer one slopes down
    let r0 = hubR * 0.9, d0 = 0
    for (const [r1, d1] of [[dia * 0.27, DROOP * 0.25], [dia * 0.5, DROOP]] as [number, number][]) {
      const mid = (r0 + r1) / 2
      g.obox([dir[0] * mid, y - (d0 + d1) / 2, dir[2] * mid], [dir[0] * (r1 - r0) / 2, -(d1 - d0) / 2, dir[2] * (r1 - r0) / 2], mul(perp, chord / 2 * (r1 > dia * 0.4 ? 0.8 : 1)), [0, 0.0014, 0], SLOT.DARK)
      r0 = r1; d0 = d1
    }
  }
  g.loft([mk([0, -hubR * 0.5, 0], X, Z, hubR * 0.8, hubR * 0.8), mk([0, 0.0005, 0], X, Z, hubR, hubR), mk([0, hubR * 0.7, 0], X, Z, hubR * 0.6, hubR * 0.6)], SLOT.METAL, {sides: 10, capStart: SLOT.METAL, capEnd: SLOT.METAL})
  return g
}

interface PodRow {z: number; w: number; h: number; cy: number}

function heliGeo(fam: HeliFamily, lg: LiveryGeo): ModelGeo {
  const g = new GeoBuilder()
  const spins: SpinPart[] = []
  const rows = (zs: number[][]): PodRow[] => zs.map(([z, w, h, cy]) => ({z, w, h, cy}))
  const podSec = (r: PodRow): Sec => mk([0, r.cy, r.z], X, Y, r.w, r.h, r.h * 0.9)
  const pod = (zs: PodRow[], n: number, slot: number = SLOT.PRIMARY, sides: number = 24) => {
    g.loft(zs.map(podSec), slot, {sides, n, capStart: SLOT.GLASS, capEnd: slot}) // the small nose-tip disc is part of the dark front glass
    return (z: number): Sec => {
      let i = 0
      while (i < zs.length - 2 && z > zs[i + 1].z) i++
      const a = zs[i], b = zs[i + 1]
      const t = clamp((z - a.z) / (b.z - a.z), 0, 1)
      return {...mk([0, lerp(a.cy, b.cy, t), z], X, Y, lerp(a.w, b.w, t), lerp(a.h, b.h, t), lerp(a.h, b.h, t) * 0.9), n}
    }
  }
  // Glazing: no frames, no grids, no boxes. One smooth dark shell wraps the front of the nose (+-60 deg yaw, bottom 25 % .. top 80 % of the cabin height) and
  // one rounded rectangle sits on each side door area (45 % .. 80 % of the cabin height, 15 % .. 45 % of the cabin length behind the nose). Every glass
  // vertex is the hull point pushed out ~1 mm-equivalent along the hull normal, with the hull normal, so the glass curves with the body and never shows on the roof, boom or back.
  const glassPt = (s0: Sec, a: number): V => add(GeoBuilder.surfacePoint(s0, a, 1), mul(GeoBuilder.surfaceNormal(s0, a), 0.0011 + 0.011 * s0.ru))
  const glazing: {kind: string; minGap: number; maxGap: number; panels: number; inward: number}[] = []
  const rec = (kind: string) => {
    let r = glazing.find((x) => x.kind === kind)
    if (!r) { r = {kind, minGap: 1e9, maxGap: 0, panels: 0, inward: 0}; glazing.push(r) }
    return r
  }
  /** Section angle (super-ellipse parameter) of the hull point at height y and lateral side `sgnX`; null when y is outside the section. */
  const angleAt = (s0: Sec, y: number, sgnX: number): number => {
    const nE = s0.n ?? 2
    const dy = y - s0.c[1]
    const q = Math.min(1, Math.abs(dy) / (dy >= 0 ? s0.rv : (s0.rv2 ?? s0.rv)))
    const cx = Math.pow(Math.max(0, 1 - Math.pow(q, nE)), 1 / nE)
    const sinA = Math.sign(dy) * Math.pow(q, nE / 2), cosA = Math.pow(cx, nE / 2)
    const a = Math.atan2(sinA, cosA)
    return sgnX >= 0 ? a : Math.PI - a
  }
  const glaze = (fn: (z: number) => Sec, zs: PodRow[], cabinEnd: number) => {
    const z0 = zs[0].z, Lc = cabinEnd - z0
    let big = zs[0]
    for (const r of zs) if (r.z <= cabinEnd && r.h > big.h) big = r
    const yBot = big.cy - 0.9 * big.h, Hc = 1.9 * big.h
    const yAt = (hf: number) => yBot + hf * Hc
    const emit = (kind: string, pts: V[][], ns: V[][], cs: V[][], from: (p: V) => V) => {
      const r = rec(kind)
      for (let i = 0; i < pts.length; i++) for (let j = 0; j < pts[i].length; j++) {
        const gap = len(sub(pts[i][j], cs[i][j]))
        r.minGap = Math.min(r.minGap, gap); r.maxGap = Math.max(r.maxGap, gap)
        if (dot(ns[i][j], sub(pts[i][j], from(pts[i][j]))) < 0) r.inward++
      }
      g.grid(pts, ns, SLOT.GLASS)
      r.panels++
    }
    // front shell: rays from the cabin axis at yaw -60..+60 deg and heights 25..80 %, first exit through the hull
    // the rays start on the axis just behind the shell so that its +-60 deg flank edge ends ahead of the side window (12 % of the cabin length)
    const zEnd = z0 + 0.12 * Lc
    const zRay = zEnd + fn(zEnd).ru * 0.5774
    const sRay = fn(zRay)
    const rayO: V = [0, sRay.c[1], zRay]
    const inside = (x: number, y: number, z: number): boolean => {
      if (z < z0 || z > zs[zs.length - 1].z) return false
      const s0 = fn(z), nE = s0.n ?? 2, dy = y - s0.c[1]
      return Math.pow(Math.abs(x) / s0.ru, nE) + Math.pow(Math.abs(dy) / (dy >= 0 ? s0.rv : (s0.rv2 ?? s0.rv)), nE) <= 1
    }
    const R_ = 10, C_ = 30
    const pts: V[][] = [], cs: V[][] = []
    for (let r = 0; r <= R_; r++) {
      const y = clamp(yAt(lerp(0.25, 0.8, r / R_)), sRay.c[1] - 0.9 * (sRay.rv2 ?? sRay.rv), sRay.c[1] + 0.9 * sRay.rv)
      const pr: V[] = [], cr: V[] = []
      for (let c = 0; c <= C_; c++) {
        const psi = lerp(-60, 60, c / C_) * Math.PI / 180
        const dx = Math.sin(psi), dz = -Math.cos(psi)
        let lo = 0, hi = 0.6
        for (let it = 0; it < 24; it++) { const m = (lo + hi) / 2; if (inside(dx * m, y, zRay + dz * m)) lo = m; else hi = m }
        let x = dx * lo, z = zRay + dz * lo
        if (z - z0 < 0.0012) { // the ray leaves through the nose-tip disc: glass just in front of it
          x = dx * ((zRay - z0) / -dz)
          pr.push([x, y, z0 - 0.0011]); cr.push([x, y, z0])
          continue
        }
        const s0 = fn(z)
        const a = angleAt(s0, y, x)
        pr.push(glassPt(s0, a)); cr.push(GeoBuilder.surfacePoint(s0, a, 1))
      }
      pts.push(pr); cs.push(cr)
    }
    const ns: V[][] = pts.map((row, r) => row.map((p, c) => {
      const du = sub(row[Math.min(C_, c + 1)], row[Math.max(0, c - 1)]), dv = sub(pts[Math.min(R_, r + 1)][c], pts[Math.max(0, r - 1)][c])
      const n = norm(cross(du, dv))
      return dot(n, sub(p, rayO)) < 0 ? mul(n, -1) : n
    }))
    emit("wind", pts, ns, cs, () => rayO)
    // side windows: one rounded rectangle per side, 15..45 % of the cabin length behind the nose, 45..80 % of the cabin height
    const zm = z0 + 0.3 * Lc, hl = 0.12 * Lc, ym = yAt(0.625), hh = 0.175 * Hc
    const NSQ = 5
    const SIDE_OFF = 0.01 // lateral projection onto the hull, pushed 0.01 out so the glass never z-fights the skin at shelf distance
    for (const side of [0, 1]) {
      const sp: V[][] = [], sn: V[][] = [], sc: V[][] = []
      for (let r = 0; r <= 6; r++) {
        const pr: V[] = [], nr: V[] = [], cr: V[] = []
        for (let c = 0; c <= 10; c++) {
          const u = (c / 10) * 2 - 1, v = (r / 6) * 2 - 1
          const f = Math.max(Math.abs(u), Math.abs(v)) / Math.max(1e-9, Math.pow(Math.pow(Math.abs(u), NSQ) + Math.pow(Math.abs(v), NSQ), 1 / NSQ))
          const z = zm + u * f * hl, y = ym + v * f * hh
          const s0 = fn(z)
          const a = angleAt(s0, y, side === 0 ? 1 : -1)
          pr.push(add(GeoBuilder.surfacePoint(s0, a, 1), mul(GeoBuilder.surfaceNormal(s0, a), SIDE_OFF))); nr.push(GeoBuilder.surfaceNormal(s0, a)); cr.push(GeoBuilder.surfacePoint(s0, a, 1))
        }
        sp.push(pr); sn.push(nr); sc.push(cr)
      }
      emit("side", sp, sn, sc, (p) => fn(p[2]).c)
    }
    // round portholes behind the door window: flat 16-segment discs, 0.26 of the cabin height across, at 62 % of the cabin height, 0.01 off the hull.
    // Two per side (55 % and 75 % of the cabin length), one at 65 % on the short-cabin light helicopters.
    for (const f of fam === "lightPiston" || fam === "lightTurbine" ? [0.65] : [0.55, 0.75]) {
      for (const side of [0, 1]) {
        const s0 = fn(z0 + f * Lc)
        const a = angleAt(s0, yAt(0.62), side === 0 ? 1 : -1)
        const n = GeoBuilder.surfaceNormal(s0, a)
        g.disc(add(GeoBuilder.surfacePoint(s0, a, 1), mul(n, SIDE_OFF)), n, 0.13 * Hc, SLOT.GLASS, 20)
      }
    }
    // livery stripe: a band along each side of the cabin below the window (22..34 % of the cabin height), in the SECONDARY colour
    if (lg.stripe) {
      for (const side of [0, 1]) {
        const pts: V[][] = [], ns: V[][] = []
        for (let r = 0; r <= 10; r++) {
          const z = lerp(z0 + 0.2 * Lc, cabinEnd, r / 10)
          const s0 = fn(z)
          const row: V[] = [], nr: V[] = []
          for (let c = 0; c <= 2; c++) {
            const a = angleAt(s0, yAt(lerp(0.22, 0.34, c / 2)), side === 0 ? 1 : -1)
            const n = GeoBuilder.surfaceNormal(s0, a)
            row.push(add(GeoBuilder.surfacePoint(s0, a, 1), mul(n, 0.0007 + 0.006 * s0.ru))); nr.push(n)
          }
          pts.push(row); ns.push(nr)
        }
        g.grid(pts, ns, SLOT.SECONDARY)
      }
    }
  }
  const skids = (xs: number, ys: number, z0: number, z1: number, struts: number[], h: number) => {
    for (const sgn of [-1, 1]) {
      g.tube([sgn * xs, ys, z0 + 0.035], [sgn * xs, ys, z1], 0.0042, 0.0042, SLOT.DARK, 6, SLOT.DARK)
      g.tube([sgn * xs, ys, z0 + 0.035], [sgn * xs, ys + 0.016, z0], 0.0042, 0.0042, SLOT.DARK, 6, SLOT.DARK)
      for (const sz of struts) g.tube([sgn * xs, ys, sz], [sgn * xs * 0.62, ys + h, sz], 0.0036, 0.0036, SLOT.DARK, 6)
    }
    for (const sz of struts) g.tube([-xs * 0.93, ys + h * 0.22, sz], [xs * 0.93, ys + h * 0.22, sz], 0.0034, 0.0034, SLOT.DARK, 6, SLOT.DARK)
  }
  const mast = (x: number, y0: number, y1: number, z: number, r: number, hubR: number, blades: number, dia: number, chord: number) => {
    g.tube([x, y0, z], [x, y1, z], r, r * 0.85, SLOT.METAL, 8, SLOT.METAL)
    g.loft([mk([x, y1 - 0.004, z], X, Z, hubR * 1.2, hubR * 1.2), mk([x, y1 + 0.004, z], X, Z, hubR * 1.2, hubR * 1.2)], SLOT.DARK, {sides: 8, capStart: SLOT.DARK, capEnd: SLOT.DARK})
    return rotorGeo(blades, dia, chord, hubR)
  }
  const tailRotor = (c: V, dia: number, blades: number, shroud: boolean = false) => {
    const tg = new GeoBuilder()
    const th = 0.0016
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2 + 0.3
      const dy = Math.cos(a), dz = Math.sin(a)
      tg.obox([0, dy * dia * 0.25, dz * dia * 0.25], [th, dy * dia * 0.25, dz * dia * 0.25], [th, -dz * 0.006, dy * 0.006], [th, 0, 0], SLOT.DARK)
    }
    tg.loft([mk([-0.004, 0, 0], Y, Z, 0.006, 0.006), mk([0.004, 0, 0], Y, Z, 0.006, 0.006)], SLOT.METAL, {sides: 8, capStart: SLOT.METAL, capEnd: SLOT.METAL})
    spins.push({name: "TailRotor", geo: tg, pivot: c, axis: "x", rate: 1.7, role: "tail", blurR: dia / 2})
    if (shroud) {
      g.loft([mk([c[0] - 0.012, c[1], c[2]], Y, Z, dia / 2 + 0.01, dia / 2 + 0.01), mk([c[0] + 0.012, c[1], c[2]], Y, Z, dia / 2 + 0.01, dia / 2 + 0.01)], SLOT.PRIMARY, {sides: 18})
      g.disc([c[0] - 0.0001, c[1], c[2]], [-1, 0, 0], dia / 2 + 0.005, SLOT.DARK, 18)
    }
  }
  const fin = (z: number, y0: number, h: number, root: number, tip: number, sweep: number, slot: number) => {
    const secs: Sec[] = [0, 0.5, 1].map((t) => {
      const ch = lerp(root, tip, t)
      return mk([0, y0 + h * t, z + sweep * t + ch / 2], Z, X, ch / 2, lerp(0.004, 0.0025, t))
    })
    const l = secs[2]
    secs.push(mk([0, l.c[1] + 0.004, l.c[2]], Z, X, l.ru * 0.5, l.rv * 0.5))
    g.loft(secs, slot, {sides: 6, capEnd: slot})
  }
  const boom = (z0: number, z1: number, y0: number, y1: number, r0: number, r1: number, slot: number) => {
    const secs: Sec[] = []
    for (let i = 0; i <= 4; i++) {
      const t = i / 4
      secs.push(mk([0, lerp(y0, y1, t), lerp(z0, z1, t)], X, Y, lerp(r0, r1, Math.pow(t, 0.8)), lerp(r0, r1, Math.pow(t, 0.8)) * 1.05))
    }
    g.loft(secs, slot, {sides: 10, capEnd: slot})
  }
  const cowl = (cx: number, y: number, z0: number, z1: number, w: number, h: number, slot: number = SLOT.PRIMARY) => {
    const L = z1 - z0
    g.loft([mk([cx, y - h * 0.4, z0], X, Y, w * 0.5, h * 0.4), mk([cx, y, z0 + L * 0.2], X, Y, w * 0.9, h), mk([cx, y, z0 + L * 0.7], X, Y, w, h * 0.9), mk([cx, y - h * 0.3, z1], X, Y, w * 0.4, h * 0.4)], slot, {sides: 10, capStart: slot, capEnd: slot})
  }

  if (fam === "lightPiston") {
    // R44 style: bubble cabin, cowled engine behind, slim boom ~1.7x cabin, two long thin blades
    const zs = rows([[-0.3, 0.014, 0.014, -0.012], [-0.288, 0.04, 0.034, -0.014], [-0.25, 0.058, 0.056, -0.004], [-0.2, 0.066, 0.072, 0], [-0.16, 0.068, 0.076, 0.003], [-0.07, 0.062, 0.07, 0.008], [-0.03, 0.05, 0.055, 0.016]])
    const fn = pod(zs, 2.3)
    glaze(fn, zs, -0.06)
    boom(0.04, 0.46, 0.058, 0.082, 0.026, 0.008, SLOT.PRIMARY)
    fin(0.405, 0.082, 0.075, 0.06, 0.032, 0.03, SLOT.SECONDARY)
    g.box([0, 0.086, 0.43], 0.05, 0.003, 0.016, SLOT.PRIMARY)
    skids(0.068, -0.105, -0.25, 0.04, [-0.17, -0.02], 0.062)
    const r = mast(0, 0.1, 0.155, -0.03, 0.006, 0.012, 2, 1, 0.026)
    spins.push({name: "MainRotor", geo: r, pivot: [0, 0.158, -0.03], axis: "y", rate: 1, role: "main", blurR: 0.5})
    tailRotor([0.016, 0.115, 0.455], 0.15, 2)
  } else if (fam === "lightTurbine") {
    // JetRanger style: smooth teardrop cabin flowing into a tapered boom, offset tail rotor
    const zs = rows([[-0.32, 0.014, 0.014, -0.016], [-0.305, 0.045, 0.04, -0.016], [-0.27, 0.064, 0.06, -0.008], [-0.22, 0.078, 0.085, 0], [-0.16, 0.082, 0.094, 0.006], [-0.05, 0.078, 0.09, 0.012], [0.05, 0.056, 0.066, 0.026], [0.13, 0.03, 0.036, 0.042]])
    const fn = pod(zs, 2.2)
    glaze(fn, zs, -0.03)
    cowl(0, 0.088, -0.05, 0.09, 0.05, 0.034, SLOT.PRIMARY)
    boom(0.11, 0.5, 0.05, 0.095, 0.03, 0.009, SLOT.PRIMARY)
    fin(0.44, 0.092, 0.095, 0.075, 0.035, 0.05, SLOT.SECONDARY)
    g.box([0, 0.1, 0.475], 0.055, 0.003, 0.018, SLOT.PRIMARY)
    skids(0.082, -0.112, -0.27, 0.06, [-0.19, -0.02], 0.066)
    const r = mast(0, 0.1, 0.17, -0.04, 0.007, 0.013, 2, 1, 0.032)
    spins.push({name: "MainRotor", geo: r, pivot: [0, 0.173, -0.04], axis: "y", rate: 1, role: "main", blurR: 0.5})
    tailRotor([0.018, 0.14, 0.5], 0.14, 2)
  } else if (fam === "mediumTwin") {
    // EC135 style: larger cabin, twin engine bumps, fenestron, four blades
    const zs = rows([[-0.33, 0.014, 0.014, -0.02], [-0.315, 0.05, 0.045, -0.02], [-0.28, 0.07, 0.068, -0.01], [-0.22, 0.088, 0.095, 0], [-0.16, 0.092, 0.104, 0.006], [-0.02, 0.088, 0.1, 0.012], [0.08, 0.06, 0.07, 0.03], [0.17, 0.03, 0.038, 0.05]])
    const fn = pod(zs, 2.5)
    glaze(fn, zs, 0.0)
    for (const sgn of [-1, 1]) cowl(sgn * 0.034, 0.106, -0.1, 0.1, 0.028, 0.026, SLOT.PRIMARY)
    boom(0.14, 0.5, 0.062, 0.09, 0.034, 0.014, SLOT.PRIMARY)
    g.box([0, 0.09, 0.47], 0.003, 0.05, 0.034, SLOT.SECONDARY)
    g.box([0, 0.1, 0.44], 0.06, 0.003, 0.018, SLOT.PRIMARY)
    skids(0.092, -0.12, -0.28, 0.1, [-0.2, 0.0], 0.07)
    const r = mast(0, 0.11, 0.18, -0.04, 0.008, 0.014, 4, 1, 0.034)
    spins.push({name: "MainRotor", geo: r, pivot: [0, 0.183, -0.04], axis: "y", rate: 1, role: "main", blurR: 0.5})
    tailRotor([0.0, 0.1, 0.505], 0.09, 4, true)
  } else if (fam === "largeTransport") {
    // Super Puma / S-92 style: long boxy cabin, sponsons with wheels, raised tail pylon with rotor, four blades
    const zs = rows([[-0.4, 0.03, 0.03, -0.03], [-0.39, 0.07, 0.055, -0.03], [-0.36, 0.088, 0.08, -0.02], [-0.3, 0.098, 0.1, -0.005], [-0.28, 0.1, 0.104, 0.002], [0.12, 0.1, 0.104, 0.002], [0.22, 0.082, 0.088, 0.016], [0.3, 0.05, 0.06, 0.04]])
    const fn = pod(zs, 3.2)
    glaze(fn, zs, 0.1)
    for (const sgn of [-1, 1]) cowl(sgn * 0.044, 0.114, -0.2, 0.06, 0.03, 0.03, SLOT.PRIMARY)
    boom(0.22, 0.5, 0.045, 0.19, 0.048, 0.02, SLOT.PRIMARY)
    fin(0.455, 0.17, 0.08, 0.07, 0.04, 0.05, SLOT.SECONDARY)
    g.box([0, 0.19, 0.5], 0.05, 0.003, 0.018, SLOT.PRIMARY)
    for (const sgn of [-1, 1]) {
      cowl(sgn * 0.098, -0.07, -0.22, 0.08, 0.026, 0.04, SLOT.PRIMARY)
      for (const z of [-0.14, 0.04]) {
        g.tube([sgn * 0.098, -0.09, z], [sgn * 0.098, -0.12, z], 0.005, 0.005, SLOT.METAL, 6)
        g.loft([mk([sgn * 0.098 - 0.008, -0.12, z], Z, Y, 0.02, 0.02), mk([sgn * 0.098 + 0.008, -0.12, z], Z, Y, 0.02, 0.02)], SLOT.DARK, {sides: 12, capStart: SLOT.DARK, capEnd: SLOT.DARK})
      }
    }
    g.tube([0, -0.075, -0.33], [0, -0.115, -0.33], 0.004, 0.004, SLOT.METAL, 6)
    g.loft([mk([-0.007, -0.12, -0.33], Z, Y, 0.016, 0.016), mk([0.007, -0.12, -0.33], Z, Y, 0.016, 0.016)], SLOT.DARK, {sides: 10, capStart: SLOT.DARK, capEnd: SLOT.DARK})
    const r = mast(0, 0.12, 0.2, -0.08, 0.01, 0.017, 4, 1, 0.034)
    spins.push({name: "MainRotor", geo: r, pivot: [0, 0.204, -0.08], axis: "y", rate: 1, role: "main", blurR: 0.5})
    tailRotor([0.014, 0.21, 0.505], 0.13, 4)
  } else {
    // Chinook style tandem: long boxy fuselage, raised rear pylon, two counter-rotating three-blade rotors
    const zs = rows([[-0.26, 0.03, 0.03, -0.012], [-0.25, 0.05, 0.04, -0.012], [-0.22, 0.06, 0.058, -0.004], [-0.17, 0.068, 0.07, 0.004], [-0.14, 0.07, 0.072, 0.006], [0.14, 0.07, 0.072, 0.006], [0.22, 0.062, 0.064, 0.016], [0.275, 0.03, 0.03, 0.036]])
    const fn = pod(zs, 3.0)
    glaze(fn, zs, 0.12)
    g.loft([mk([0, 0.082, 0.12], X, Y, 0.032, 0.03), mk([0, 0.16, 0.185], X, Y, 0.036, 0.07), mk([0, 0.22, 0.205], X, Y, 0.026, 0.05)], SLOT.PRIMARY, {sides: 12, capEnd: SLOT.PRIMARY})
    for (const sgn of [-1, 1]) {
      cowl(sgn * 0.05, -0.052, -0.12, 0.09, 0.022, 0.03, SLOT.PRIMARY)
      for (const z of [-0.1, 0.1]) {
        g.tube([sgn * 0.052, -0.06, z], [sgn * 0.052, -0.088, z], 0.004, 0.004, SLOT.METAL, 6)
        g.loft([mk([sgn * 0.052 - 0.006, -0.094, z], Z, Y, 0.016, 0.016), mk([sgn * 0.052 + 0.006, -0.094, z], Z, Y, 0.016, 0.016)], SLOT.DARK, {sides: 10, capStart: SLOT.DARK, capEnd: SLOT.DARK})
      }
    }
    g.box([0, -0.052, 0.27], 0.04, 0.004, 0.024, SLOT.PRIMARY)
    const front = mast(0, 0.074, 0.115, -0.19, 0.008, 0.015, 3, 0.58, 0.026)
    spins.push({name: "MainRotor", geo: front, pivot: [0, 0.118, -0.19], axis: "y", rate: 1, role: "main", blurR: 0.29})
    const rear = mast(0, 0.22, 0.262, 0.19, 0.008, 0.015, 3, 0.58, 0.026)
    spins.push({name: "RearRotor", geo: rear, pivot: [0, 0.265, 0.19], axis: "y", rate: -1, role: "other", blurR: 0.29})
  }
  return {body: g, spins, bodySpin: false, glazing}
}

// ---------- satellites ----------
/**
 * Solar panel with real thickness. Front (+Y): cell plate with a grid of dark seams. Back (-Y): darker substrate with a rib grid
 * (the "grid texture") and, when `full`, a perimeter frame. c = centre, w / d = half extents in x / z, th = half thickness.
 */
function panel(g: GeoBuilder, c: V, w: number, d: number, th: number, cx: number, cz: number, full: boolean): void {
  g.box(c, w, th, d, SLOT.GRID)
  g.box([c[0], c[1] + th, c[2]], w * 0.975, 0.0014, d * 0.975, SLOT.CELL)
  const yL = c[1] + th + 0.0014
  for (let i = 1; i < cx; i++) g.box([c[0] - w + (2 * w * i) / cx, yL, c[2]], 0.0012, 0.0007, d * 0.975, SLOT.GRID)
  for (let j = 1; j < cz; j++) g.box([c[0], yL, c[2] - d + (2 * d * j) / cz], w * 0.975, 0.0007, 0.0012, SLOT.GRID)
  const yB = c[1] - th - 0.0018
  for (let i = 0; i <= (full ? cx : 1); i++) g.box([c[0] - w + (2 * w * i) / (full ? cx : 1), yB, c[2]], 0.003, 0.0018, d, SLOT.METAL)
  for (let j = 0; j <= (full ? cz : 0); j++) g.box([c[0], yB, c[2] - d + (full ? (2 * d * j) / cz : d)], w, 0.0018, 0.003, SLOT.METAL)
  if (full) {
    for (const sz of [-1, 1]) g.box([c[0], c[1], c[2] + sz * d], w + 0.004, th * 1.5, 0.004, SLOT.METAL)
    for (const sx of [-1, 1]) g.box([c[0] + sx * w, c[1], c[2]], 0.004, th * 1.5, d + 0.004, SLOT.METAL)
  }
}

function satGeo(fam: SatFamily): ModelGeo {
  const g = new GeoBuilder()
  const spins: SpinPart[] = []
  if (fam === "cubesat") {
    // 3U body: rails, panelled faces, lens, antennas; two hinged two-segment wings with ribbed backs
    g.box([0, 0, 0], 0.07, 0.07, 0.1, SLOT.METAL)
    g.box([0, 0, 0], 0.0725, 0.0725, 0.03, SLOT.PRIMARY)
    g.box([0, 0, 0.06], 0.0725, 0.0725, 0.012, SLOT.FOIL)
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.box([sx * 0.07, sy * 0.07, 0], 0.008, 0.008, 0.103, SLOT.DARK)
    g.box([0, 0, -0.1], 0.052, 0.052, 0.004, SLOT.GLASS)
    g.disc([0, 0, -0.1045], [0, 0, -1], 0.03, SLOT.DARK, 10)
    for (const sgn of [-1, 1]) {
      g.box([sgn * 0.0725 + sgn * 0.012, 0, 0.03], 0.012, 0.004, 0.006, SLOT.METAL)
      panel(g, [sgn * 0.16, 0, 0.03], 0.075, 0.055, 0.004, 3, 2, true)
      g.box([sgn * 0.2375, 0, 0.03], 0.006, 0.0045, 0.012, SLOT.METAL)
      panel(g, [sgn * 0.3175, 0, 0.03], 0.075, 0.055, 0.004, 3, 2, true)
    }
    g.tube([0, 0.07, 0.09], [0, 0.2, 0.09], 0.0035, 0.0035, SLOT.METAL, 6, SLOT.METAL)
    g.tube([0.04, 0.07, 0.0], [0.04, 0.16, 0.0], 0.003, 0.003, SLOT.METAL, 6, SLOT.METAL)
    g.box([-0.04, -0.075, 0.05], 0.02, 0.004, 0.02, SLOT.WHITE)
    g.transform(1.15)
  } else if (fam === "comms") {
    // bus with foil wrap and radiator, boom through two ribbed panels, dish on an arm, thruster nozzles
    g.box([0, 0, 0], 0.095, 0.095, 0.13, SLOT.PRIMARY)
    g.box([0, 0, 0.0], 0.1, 0.1, 0.045, SLOT.FOIL)
    g.box([0, 0, 0.09], 0.1, 0.1, 0.012, SLOT.FOIL)
    g.box([0, -0.097, 0.02], 0.07, 0.004, 0.09, SLOT.WHITE)
    g.box([0, 0, -0.131], 0.07, 0.07, 0.003, SLOT.GLASS)
    g.tube([-0.5, 0, 0], [0.5, 0, 0], 0.006, 0.006, SLOT.METAL, 6, SLOT.METAL)
    for (const sgn of [-1, 1]) {
      panel(g, [sgn * 0.31, 0, 0], 0.2, 0.1, 0.006, 6, 3, true)
      g.box([sgn * 0.1, 0, 0], 0.012, 0.012, 0.012, SLOT.METAL)
      for (const sz of [-1, 1]) g.tube([sgn * 0.0, -0.1, sz * 0.1], [sgn * 0.0, -0.13, sz * 0.1], 0.006, 0.01, SLOT.DARK, 6, SLOT.DARK)
    }
    const f = frame(norm([0, 0.3, -0.7]))
    const dc: V = [0, 0.19, -0.11]
    g.loft([
      mk(dc, X, Y, 0.012, 0.012),
      mk(add(dc, mul([0, 0.3, -0.7], 0.012)), X, Y, 0.06, 0.06),
      mk(add(dc, mul([0, 0.3, -0.7], 0.02)), X, Y, 0.1, 0.1)
    ].map((s) => ({...s, u: f.u, v: f.v})), SLOT.WHITE, {sides: 14, capEnd: SLOT.WHITE})
    g.tube([0, 0.095, -0.03], [0, 0.18, -0.1], 0.006, 0.006, SLOT.METAL, 6)
    g.tube(add(dc, mul([0, 0.3, -0.7], 0.02)), add(dc, mul([0, 0.3, -0.7], 0.06)), 0.003, 0.003, SLOT.METAL, 6, SLOT.METAL)
    g.tube([0.05, -0.095, 0.05], [0.05, -0.19, 0.08], 0.004, 0.003, SLOT.METAL, 6, SLOT.METAL)
  } else if (fam === "flatpanel") {
    // one thick framed panel; the bus, thermal-blanket strip, struts and antennas hang off its BACK
    panel(g, [0, 0, 0], 0.5, 0.21, 0.008, 10, 4, true)
    g.box([0, -0.078, 0], 0.065, 0.055, 0.085, SLOT.PRIMARY)
    g.box([0, -0.078, 0], 0.0675, 0.057, 0.028, SLOT.FOIL)
    g.box([0, -0.078, 0.07], 0.0675, 0.057, 0.008, SLOT.FOIL)
    g.box([0, -0.136, 0], 0.05, 0.003, 0.07, SLOT.WHITE)
    g.box([0, -0.07, -0.088], 0.04, 0.03, 0.003, SLOT.GLASS)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.tube([sx * 0.062, -0.04, sz * 0.08], [sx * 0.24, -0.0185, sz * 0.19], 0.0035, 0.0035, SLOT.METAL, 6)
    }
    g.tube([0.065, -0.078, 0.0], [0.3, -0.13, 0.0], 0.0028, 0.002, SLOT.METAL, 6, SLOT.METAL)
    const dd: V = [-0.03, -0.14, 0.05]
    g.tube([-0.03, -0.136, 0.05], dd, 0.004, 0.004, SLOT.METAL, 6)
    g.disc([dd[0], dd[1] - 0.004, dd[2]], [0, -1, 0.3], 0.03, SLOT.WHITE, 12)
    // front: sun sensor box and a mast with a small dish so the top face reads as a vehicle, not a tile
    g.box([0.36, 0.0125, -0.12], 0.012, 0.005, 0.012, SLOT.PRIMARY)
    g.box([0.36, 0.0185, -0.12], 0.008, 0.001, 0.008, SLOT.GLASS)
    g.tube([-0.43, 0.01, 0.15], [-0.43, 0.1, 0.15], 0.004, 0.0025, SLOT.METAL, 6, SLOT.METAL)
    g.disc([-0.43, 0.1, 0.15], [0.3, 1, 0], 0.022, SLOT.WHITE, 12)
  } else {
    // station: truss, 8 ribbed arrays, modules, radiators
    g.box([0, 0, 0], 0.46, 0.012, 0.012, SLOT.METAL)
    g.box([0, 0.012, 0], 0.46, 0.0016, 0.014, SLOT.PRIMARY)
    for (const sgn of [-1, 1]) {
      for (const dx of [0.39, 0.25]) {
        for (const sz of [-1, 1]) {
          panel(g, [sgn * dx, 0, sz * 0.15], 0.055, 0.115, 0.004, 3, 3, false)
          g.box([sgn * dx, 0, sz * 0.03], 0.004, 0.004, 0.02, SLOT.METAL)
        }
      }
      g.box([sgn * 0.12, -0.04, 0.0], 0.02, 0.024, 0.05, SLOT.WHITE)
    }
    // pressurised modules along z, node across x
    const mod = (z0: number, z1: number, r: number, slot: number = SLOT.PRIMARY) => g.loft([
      mk([0, -0.03, z0], X, Y, r * 0.9, r * 0.9), mk([0, -0.03, z0 + (z1 - z0) * 0.06], X, Y, r, r), mk([0, -0.03, z1 - (z1 - z0) * 0.06], X, Y, r, r), mk([0, -0.03, z1], X, Y, r * 0.9, r * 0.9)
    ], slot, {sides: 10, capStart: SLOT.METAL, capEnd: SLOT.METAL})
    mod(-0.2, -0.02, 0.026)
    mod(-0.02, 0.14, 0.03, SLOT.WHITE)
    mod(0.14, 0.24, 0.022)
    g.tube([-0.07, -0.03, -0.02], [0.07, -0.03, -0.02], 0.018, 0.018, SLOT.PRIMARY, 10, SLOT.METAL)
    g.tube([0, -0.03, -0.2], [0, -0.03, -0.25], 0.012, 0.012, SLOT.METAL, 8, SLOT.METAL)
    g.tube([0, 0.02, -0.02], [0, 0.0, -0.02], 0.014, 0.014, SLOT.METAL, 8, SLOT.METAL)
    g.box([0, 0.05, 0.1], 0.07, 0.003, 0.04, SLOT.WHITE)
    g.box([0, -0.015, 0.26], 0.008, 0.008, 0.02, SLOT.METAL)
    g.transform(1.08)
  }
  return {body: g, spins, bodySpin: true}
}

export function buildGeo(fam: ModelFamily, lg: LiveryGeo = PLAIN_LIVERY): ModelGeo {
  switch (fam) {
    case "lightPiston": case "lightTurbine": case "mediumTwin": case "largeTransport": case "tandem": return heliGeo(fam, lg)
    case "cubesat": case "comms": case "flatpanel": case "station": return satGeo(fam)
    default: return airlinerGeo(fam, lg)
  }
}
