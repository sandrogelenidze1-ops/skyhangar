// SkyHangarPlants.ts
// Owns: three decorative large-leaf potted plants (monstera / fiddle-leaf style) for the PREVIEW-ONLY rooftop, built once at startup from code.
//  - Each plant: a tapered pot (two terracotta, one light concrete) with a rim and soil, and 9-11 big leaves on thin curved stems fanning outward.
//    A leaf is a flat, gently cupped and drooping blade (heart-like outline, 6 rows x 2 halves) with a lighter underside and a light midrib line.
//  - Everything is merged: all three plants share seven static meshes (pot, concrete pot, soil, three leaf greens, light underside + veins).
//    No scripts, no textures, nothing per frame.
//  - Spots are fixed (the two back corners and beside the right-hand AC unit), set back from the parapet and out of the forward view; each plant stays
//    about 0.8-1.2 m tall and under 0.7 m wide from its centre, so nothing blocks the sky, the horizon, the spawn spot, the menu or the shelf.
// Colours are medium-bright (the additive display shows near-black as see-through). Must not: interact, animate or hold per-frame logic.

import {MeshBatch} from "./SkyHangarBatch"
import {makeObj, minLuminance} from "./SkyHangarUtil"

type V3 = number[]
type RGB = [number, number, number]

const DEG = Math.PI / 180
const Z = [0, 0, 1, 1]

/** Plant centres on the roof, cm (x right, z toward the back; the roof middle is 0, 0 and the parapet's inner face is at +-1500). */
export const PLANT_SPOTS: [number, number][] = [[-1290, 1290], [1290, 1290], [1040, -190]]
export const PLANT_POT_HEIGHT = 32 // pot with soil, cm (at the unscaled size)
export const PLANT_SCALE = 1.6 // uniform size of the whole plant, pot included: leaves rise well above the 110 cm parapet from the default position

export interface PlantStats {leaves: number; minY: number; maxY: number; maxR: number} // heights above the floor, reach from the plant centre

const add = (a: V3, b: V3, k: number = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

/** The seven batches the plants are appended to. */
export class PlantBatches {
  pot = new MeshBatch()
  concrete = new MeshBatch()
  soil = new MeshBatch()
  leaf = [new MeshBatch(), new MeshBatch(), new MeshBatch()]
  light = new MeshBatch() // leaf undersides and midrib lines
}

/** Append one plant standing on the floor at (cx, floorY, cz). `index` picks the pot and seeds the leaf layout. Returns its measured size. */
export function addPlant(B: PlantBatches, cx: number, floorY: number, cz: number, index: number): PlantStats {
  const marks = [B.pot, B.concrete, B.soil, B.leaf[0], B.leaf[1], B.leaf[2], B.light].map((b) => b.mark())
  let seed = 1234 + index * 7919
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const st: PlantStats = {leaves: 0, minY: 0, maxY: 0, maxR: 0}
  const track = (p: V3): void => {
    st.minY = Math.min(st.minY, p[1] - floorY)
    st.maxY = Math.max(st.maxY, p[1] - floorY)
    st.maxR = Math.max(st.maxR, Math.hypot(p[0] - cx, p[2] - cz))
  }

  // pot: 30 cm tapered body, a 5 cm rim, a dab of soil on top
  const potB = index === 2 ? B.concrete : B.pot
  potB.prism(cx, floorY, cz, 13, 30, 10, Z, 19 / 13)
  potB.prism(cx, floorY + 26, cz, 20.5, 5, 10, Z, 1)
  B.soil.prism(cx, floorY + 30, cz, 18, 2, 10, Z, 0.97)
  track([cx + 20.5, floorY, cz])
  track([cx, floorY + PLANT_POT_HEIGHT, cz])

  const y0 = floorY + PLANT_POT_HEIGHT
  const n = 9 + (index % 3) // 9, 10, 11 leaves
  const yaw0 = rnd() * 6.28
  for (let k = 0; k < n; k++) {
    const t = n > 1 ? k / (n - 1) : 0 // 0 = lowest, widest leaf .. 1 = the young upright leaf in the middle
    const phi = yaw0 + k * 2.399 + (rnd() - 0.5) * 0.35 // golden-angle fan
    const o: V3 = [Math.cos(phi), 0, Math.sin(phi)]
    const r0 = 3 + 5 * rnd()
    const ht = 26 + 30 * t + (rnd() - 0.5) * 6 // stem height above the soil
    const dOut = 4 + 20 * (1 - t) + 4 * rnd() // how far the stem tip leans out
    const base: V3 = [cx + o[0] * r0, y0, cz + o[2] * r0]
    const tip: V3 = [base[0] + o[0] * dOut, y0 + ht, base[2] + o[2] * dOut]
    const ctl: V3 = [base[0] + o[0] * dOut * 0.15, y0 + ht * 0.9, base[2] + o[2] * dOut * 0.15]
    const mid: V3 = [0.25 * base[0] + 0.5 * ctl[0] + 0.25 * tip[0], 0.25 * base[1] + 0.5 * ctl[1] + 0.25 * tip[1], 0.25 * base[2] + 0.5 * ctl[2] + 0.25 * tip[2]]
    B.leaf[1].cylinder(base, mid, 0.9, 4, Z)
    B.leaf[1].cylinder(mid, tip, 0.8, 4, Z)
    track(tip)
    const L = 25 + 8 * rnd() + 4 * (1 - t)
    const W = L * (0.34 + 0.04 * rnd())
    const el0 = (8 + 52 * t + (rnd() - 0.5) * 12) * DEG
    const bend = (30 + 14 * rnd()) * DEG
    leaf(B, B.leaf[k % 3], tip, o, el0, bend, L, W, track)
    st.leaves++
  }
  // the whole plant (pot included) is built at the original size, then scaled uniformly about its base centre so its position on the roof is unchanged
  const all = [B.pot, B.concrete, B.soil, B.leaf[0], B.leaf[1], B.leaf[2], B.light]
  all.forEach((b, i) => b.scaleSince(marks[i], [cx, floorY, cz], PLANT_SCALE))
  st.minY *= PLANT_SCALE; st.maxY *= PLANT_SCALE; st.maxR *= PLANT_SCALE
  return st
}

/** One leaf: rows 0..ROWS along the blade, three points per row (left edge, midrib, right edge). Edges sit slightly above the midrib (a shallow cup). */
const ROWS = 5
function leaf(B: PlantBatches, top: MeshBatch, T: V3, o: V3, el0: number, bend: number, L: number, W: number, track: (p: V3) => void): void {
  const s: V3 = [o[2], 0, -o[0]] // horizontal, across the blade
  const mid: V3[] = [], le: V3[] = [], ri: V3[] = [], nn: V3[] = [], wd: number[] = []
  let p = T
  for (let j = 0; j <= ROWS; j++) {
    const u = j / ROWS
    const th = el0 - bend * u
    const a: V3 = [Math.cos(th) * o[0], Math.sin(th), Math.cos(th) * o[2]]
    const nrm = unit(cross(a, s))
    const w = W * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.85) // heart-like outline: broad near the base, pointed tip
    const fold = 0.16 * w
    mid.push(p)
    le.push(add(add(p, s, w), nrm, fold))
    ri.push(add(add(p, s, -w), nrm, fold))
    nn.push(nrm)
    wd.push(w)
    track(le[j]); track(ri[j]); track(p)
    // the next row's position: step along the axis at the middle of this segment
    const thm = el0 - bend * (u + 0.5 / ROWS)
    p = add(p, [Math.cos(thm) * o[0], Math.sin(thm), Math.cos(thm) * o[2]], L / ROWS)
  }
  const face = (a: V3, b: V3, c: V3, d: V3): void => {
    const nrm = unit(cross([c[0] - a[0], c[1] - a[1], c[2] - a[2]], [d[0] - b[0], d[1] - b[1], d[2] - b[2]]))
    top.quad(a, b, c, d, nrm[0], nrm[1], nrm[2], Z) // top face (counter-clockwise seen from above)
    B.light.quad(a, d, c, b, -nrm[0], -nrm[1], -nrm[2], Z) // lighter underside: the same blade, reversed
  }
  for (let j = 0; j < ROWS; j++) {
    face(mid[j], mid[j + 1], le[j + 1], le[j])
    face(ri[j], ri[j + 1], mid[j + 1], mid[j])
    // midrib: a thin light strip just above the blade
    const v0 = 0.75 * (1 - 0.7 * (j / ROWS)), v1 = 0.75 * (1 - 0.7 * ((j + 1) / ROWS))
    const m0 = add(mid[j], nn[j], 0.3), m1 = add(mid[j + 1], nn[j + 1], 0.3)
    B.light.quad(add(m0, s, -v0), add(m1, s, -v1), add(m1, s, v1), add(m0, s, v0), nn[j][0], nn[j][1], nn[j][2], Z)
  }
}

const COLORS: {[k: string]: RGB} = {
  pot: [0.92, 0.58, 0.42], // terracotta
  concrete: [0.84, 0.84, 0.82], // light concrete
  soil: [0.62, 0.48, 0.36],
  leafA: [0.45, 0.86, 0.38], // three healthy medium-bright greens
  leafB: [0.55, 0.9, 0.42],
  leafC: [0.38, 0.8, 0.44],
  light: [0.74, 0.93, 0.56] // underside and midrib, a lighter yellow-green
}

/** Build all three plants into seven meshes under `parent`. `litMat` is the roof's opaque lit material (cloned per colour). Returns the measured sizes. */
export function buildPlants(parent: SceneObject, floorY: number, litMat: Material, order: number, onMat?: (m: Material, c: RGB) => void): PlantStats[] {
  const root = makeObj(parent, "Plants")
  const B = new PlantBatches()
  const stats = PLANT_SPOTS.map(([x, z], i) => addPlant(B, x, floorY, z, i))
  const mat = (c: RGB): Material => {
    const m = litMat.clone()
    m.mainPass.blendMode = BlendMode.Disabled
    m.mainPass.depthWrite = true
    m.mainPass.depthTest = true
    m.mainPass.twoSided = false
    const lc = minLuminance(c, 0.6)
    m.mainPass.baseColor = new vec4(Math.min(0.95, lc[0]), Math.min(0.95, lc[1]), Math.min(0.95, lc[2]), 1)
    m.mainPass.roughness = 0.85
    m.mainPass.metallic = 0
    if (onMat) onMat(m, [Math.min(0.95, lc[0]), Math.min(0.95, lc[1]), Math.min(0.95, lc[2])]) // the roof re-lights it per time of day (night = this colour)
    return m
  }
  B.pot.build(root, "PlantPot", mat(COLORS.pot), order)
  B.concrete.build(root, "PlantPotConcrete", mat(COLORS.concrete), order)
  B.soil.build(root, "PlantSoil", mat(COLORS.soil), order)
  B.leaf[0].build(root, "PlantLeavesA", mat(COLORS.leafA), order)
  B.leaf[1].build(root, "PlantLeavesB", mat(COLORS.leafB), order)
  B.leaf[2].build(root, "PlantLeavesC", mat(COLORS.leafC), order)
  B.light.build(root, "PlantLeafLight", mat(COLORS.light), order)
  return stats
}
