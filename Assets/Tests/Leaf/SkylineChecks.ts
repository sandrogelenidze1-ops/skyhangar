// Pure skyline checks (no Lens globals) so the same assertions run in the LEAF scenario SH_N_Skyline and in plain Node.
import {skylineTowers, paintSkylineAtlas, towerTotalElevation, SKY_COUNT, SKY_BASE, SKY_CELL_W, SKY_CELL_H, SKY_ATLAS_W, SKY_MAX_TOP_EL, SKY_FRONT_MAX_EL, SKY_MAX_TOTAL_EL} from "../../Scripts/SkyHangarSkylineSpec"

export interface Check {
  check(name: string, input: "inspection", pass: boolean, detail?: string): boolean
}

const RING_C_FAR_EDGE = 4600 * 1.03 + 130 // farthest face of the existing far ring (distance jitter 3%, 260 cm deep)
const SKY_DOME = 6000
const lum = (r: number, g: number, b: number): number => 0.3 * r + 0.4 * g + 0.3 * b

export function runSkylineChecks(c: Check, print: (s: string) => void): void {
  const towers = skylineTowers()
  c.check("12-20 towers", "inspection", towers.length >= 12 && towers.length <= 20 && towers.length === SKY_COUNT, `${towers.length}`)
  c.check("deterministic (two builds identical)", "inspection", JSON.stringify(towers) === JSON.stringify(skylineTowers()))

  const nearest = Math.min(...towers.map((t) => t.dist - t.d / 2)), farthest = Math.max(...towers.map((t) => t.dist + t.d / 2))
  c.check("every tower stands beyond the existing far ring (gap >= 100 cm)", "inspection", nearest >= RING_C_FAR_EDGE + 100, `nearest ${nearest.toFixed(0)} vs ring C edge ${RING_C_FAR_EDGE.toFixed(0)}`)
  c.check("every tower stays inside the sky dome", "inspection", farthest < SKY_DOME - 50, `farthest ${farthest.toFixed(0)} < ${SKY_DOME}`)

  const els = towers.map((t) => towerTotalElevation(t))
  const tallest = Math.max(...els)
  c.check(`tallest point (antenna included) <= ${SKY_MAX_TOTAL_EL} degrees`, "inspection", tallest <= SKY_MAX_TOTAL_EL, `${tallest.toFixed(2)}`)
  const bodyEl = (t: (typeof towers)[0]) => (Math.atan2(t.top, t.dist) * 180) / Math.PI
  c.check(`tower bodies <= ${SKY_MAX_TOP_EL} degrees`, "inspection", towers.every((t) => bodyEl(t) <= SKY_MAX_TOP_EL + 1e-6))
  const ahead = towers.filter((t) => Math.abs(t.az > Math.PI ? t.az - 2 * Math.PI : t.az) < Math.PI / 6)
  c.check(`towers in the central 60 degrees stay <= ${SKY_FRONT_MAX_EL} degrees`, "inspection", ahead.every((t) => bodyEl(t) <= SKY_FRONT_MAX_EL + 1e-6), `${ahead.length} ahead`)
  const widths = towers.map((t) => t.w), heights = towers.map((t) => t.top - SKY_BASE)
  c.check("varied widths and heights", "inspection", Math.max(...widths) / Math.min(...widths) > 1.5 && Math.max(...heights) / Math.min(...heights) > 1.3, `w ${Math.min(...widths).toFixed(0)}..${Math.max(...widths).toFixed(0)}, h ${Math.min(...heights).toFixed(0)}..${Math.max(...heights).toFixed(0)}`)
  const beacons = towers.filter((t) => t.beacon)
  c.check("a few towers carry a red beacon on a thin antenna", "inspection", beacons.length >= 3 && beacons.length <= 8 && beacons.every((t) => t.antH > 0), `${beacons.length}`)

  // polygon budget: each box is 5 quads = 10 triangles
  let tris = 0
  for (const t of towers) tris += 10 * (1 + (t.crownH > 0 ? 1 : 0) + (t.antH > 0 ? 1 : 0) + (t.beacon ? 1 : 0))
  c.check("low polygon count (<= 1000 triangles, two meshes)", "inspection", tris <= 1000, `${tris}`)

  // atlas: never black, haze lighter at the base, warm window specks present
  const px = paintSkylineAtlas(towers)
  let minL = 9, litSpecks = 0, baseSum = 0, topSum = 0
  for (const t of towers) {
    for (let r = 0; r < SKY_CELL_H; r++) {
      for (let x = 0; x < SKY_CELL_W; x++) {
        const o = (r * SKY_ATLAS_W + t.index * SKY_CELL_W + x) * 4
        const l = lum(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255)
        minL = Math.min(minL, l)
        if (px[o] > 235 && px[o + 1] > 190 && px[o + 2] < 235 && px[o] > px[o + 2] + 20) litSpecks++ // warm yellow / white specks
        if (r < 24) baseSum += l
        if (r >= SKY_CELL_H - 60 && r < SKY_CELL_H - 36) topSum += l
      }
    }
  }
  c.check("every facade texel is bright (luminance >= 0.5, never black)", "inspection", minL >= 0.5, `min ${minL.toFixed(3)}`)
  c.check("tower body colour is a desaturated blue/violet, base lighter than the top (haze)", "inspection", baseSum > topSum * 1.05, `base ${(baseSum / (24 * SKY_CELL_W * towers.length)).toFixed(3)} top ${(topSum / (24 * SKY_CELL_W * towers.length)).toFixed(3)}`)
  c.check("warm yellow / white window specks present", "inspection", litSpecks > 400, `${litSpecks} texels`)
  // time-of-day tint keeps the dimmest body texel above the backdrop floors (day 0.62, dusk 0.5, night 0.38)
  const tints: [string, number[], number][] = [["day", [1, 1, 1], 0.62], ["dusk", [1, 0.82, 0.86], 0.5], ["night", [0.72, 0.76, 0.98], 0.38]]
  let minBody = 9
  for (let r = SKY_CELL_H - 40; r < SKY_CELL_H; r++) { // top rows = the least hazy wall
    for (const t of towers) {
      const o = (r * SKY_ATLAS_W + t.index * SKY_CELL_W + 0) * 4 // column 0 is wall, not a window
      minBody = Math.min(minBody, lum(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255))
    }
  }
  for (const [name, tint, floor] of tints) {
    const l = minBody * lum(tint[0], tint[1], tint[2]) // tint is near-neutral; scale the luminance
    c.check(`${name}: dimmest wall >= ${floor} after tint`, "inspection", l >= floor - 0.005, `${l.toFixed(3)}`)
  }
  print(`[SH-TEST] skyline: ${towers.length} towers, ${tris} triangles, tallest ${tallest.toFixed(2)} deg, nearest ${nearest.toFixed(0)} cm, ${litSpecks} lit texels`)
}
