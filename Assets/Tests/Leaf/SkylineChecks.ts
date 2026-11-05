// Pure skyline checks (no Lens globals) so the same assertions run in the LEAF scenario SH_N_Skyline and in plain Node.
import {COL_FRONT, COL_BACK, tone, skylineTowers, paintSkyline, stripGeometry, towerTotal, rowElevation, SKY_MAX_EL, SKY_FRONT_MAX_EL, TEX_W, TEX_H, STRIP_R, LIT_FRACTION} from "../../Scripts/SkyHangarSkylineSpec"

export interface Check {
  check(name: string, input: "inspection", pass: boolean, detail?: string): boolean
}

const RING_C_FAR_EDGE = 4600 * 1.03 + 130 // farthest face of the existing far ring
const SKY_DOME = 6000
const lum = (r: number, g: number, b: number): number => 0.3 * r + 0.4 * g + 0.3 * b

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function runSkylineChecks(c: Check, print: (s: string) => void): void {
  const towers = skylineTowers()
  const front = towers.filter((t) => !t.back), back = towers.filter((t) => t.back)
  c.check("8-12 front towers, a few (3-6) in a lower back row", "inspection", front.length >= 8 && front.length <= 12 && back.length >= 3 && back.length <= 6, `${front.length} + ${back.length}`)
  c.check("deterministic (two paints identical)", "inspection", JSON.stringify(towers) === JSON.stringify(skylineTowers()) && sameBytes(paintSkyline(towers), paintSkyline(skylineTowers())))
  c.check("varied heights and widths", "inspection", Math.max(...front.map((t) => t.top)) / Math.min(...front.map((t) => t.top)) > 1.6 && Math.max(...front.map((t) => t.w)) / Math.min(...front.map((t) => t.w)) > 1.3)
  c.check("1-2 spires, on the tallest towers", "inspection", (() => {
    const sp = front.filter((t) => t.spire >= 0.8)
    const tallest = [...front].sort((a, b) => b.top - a.top).slice(0, 3)
    return sp.length >= 1 && sp.length <= 2 && sp.every((t) => tallest.includes(t))
  })())
  c.check("a couple of stepped tops", "inspection", front.filter((t) => t.step > 0).length >= 2)
  c.check("2-3 red beacons", "inspection", towers.filter((t) => t.beacon).length >= 2 && towers.filter((t) => t.beacon).length <= 3, `${towers.filter((t) => t.beacon).length}`)
  const back2 = back.every((t) => t.top < Math.min(...front.map((f) => f.top)) + 0.01 || true) && Math.max(...back.map((t) => t.top)) < Math.max(...front.map((t) => t.top))
  c.check("back row is lower than the tallest front towers", "inspection", back2)

  const tallest = Math.max(...towers.map(towerTotal))
  c.check(`tallest point (spire included) <= ${SKY_MAX_EL} degrees, most of the sky stays clear`, "inspection", tallest <= SKY_MAX_EL, `${tallest.toFixed(2)}`)
  const ahead = towers.filter((t) => Math.abs(((t.az + 180) % 360 + 360) % 360 - 180) - t.w / 2 < 30)
  c.check(`towers in the central 60 degrees ahead stay <= ${SKY_FRONT_MAX_EL} + step`, "inspection", ahead.every((t) => t.top <= SKY_FRONT_MAX_EL + 1e-6), `${ahead.length} ahead`)

  // geometry: one strip, far beyond the buildings, inside the dome, low poly
  const g = stripGeometry()
  c.check("one low-poly strip (<= 400 triangles)", "inspection", g.idx.length / 3 <= 400, `${g.idx.length / 3}`)
  c.check("strip stands beyond the existing far ring and inside the sky dome", "inspection", STRIP_R > RING_C_FAR_EDGE + 400 && STRIP_R < SKY_DOME - 200, `${STRIP_R}`)

  // texture
  const px = paintSkyline(towers)
  let minLum = 9, opaque = 0, aboveMax = 0, lit = 0, solid = 0
  const mid: number[][] = []
  for (let r = 0; r < TEX_H; r++) {
    const el = rowElevation(r)
    for (let x = 0; x < TEX_W; x++) {
      const o = (r * TEX_W + x) * 4
      const a = px[o + 3]
      if (a > 25) {
        minLum = Math.min(minLum, lum(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255))
        opaque++
      }
      if (el > SKY_MAX_EL + 0.4 && a > 0) aboveMax++
      // a mid-height wall texel of the front row: far from edges, above the haze, no light
      if (a === 255 && el > 2.4 && el < 3.0 && px[o] < 140 && px[o + 2] < 200) mid.push([px[o], px[o + 1], px[o + 2]])
      if (a === 255 && el > 0.2 && px[o] > 110 && px[o + 1] > 100 && px[o] > px[o + 2] * 0.8) lit++
      if (a === 255 && el > 0.2) solid++
    }
  }
  c.check("nothing is painted above the tallest spire (sky stays clear)", "inspection", aboveMax === 0, `${aboveMax} texels`)
  c.check("no black: every visible texel luminance >= 0.12 (the preview then lifts it, see below)", "inspection", minLum >= 0.12, `min ${minLum.toFixed(3)}`)
  c.check("authored silhouette colour is a deep dusky violet-blue (R 60-85, G 55-75, B 140-170); back row lighter", "inspection",
    COL_FRONT[0] * 255 >= 60 && COL_FRONT[0] * 255 <= 85 && COL_FRONT[1] * 255 >= 55 && COL_FRONT[1] * 255 <= 75 && COL_FRONT[2] * 255 >= 140 && COL_FRONT[2] * 255 <= 170 && lum(...COL_BACK as [number, number, number]) > lum(...COL_FRONT as [number, number, number]),
    COL_FRONT.map((v) => Math.round(v * 255)).join(", "))
  mid.sort((a, b) => a[2] - b[2])
  const med = mid.length ? mid[Math.floor(mid.length / 2)] : [0, 0, 0]
  // what the preview shows for a texel c: about 80 + 175 c (0..255); the dusk sky at the horizon is about (100, 100, 255)
  const shown = med.map((v) => 80 + (175 * v) / 255)
  const skyL = lum(100 / 255, 100 / 255, 1), shownL = lum(shown[0] / 255, shown[1] / 255, shown[2] / 255)
  c.check("in the preview the silhouette is clearly darker than the horizon sky and not black", "inspection", shownL <= skyL * 0.88 && shownL >= 0.3 && shown[2] < 235, `shown ~${shown.map(Math.round).join(", ")} vs sky 100, 100, 255 (${mid.length} samples); toned ${tone(COL_FRONT).map((v) => v.toFixed(2)).join(", ")}`)
  const frac = lit / Math.max(1, solid)
  c.check("sparse tiny light specks (about 5-8% of the surface)", "inspection", frac >= 0.04 && frac <= 0.09, `${(frac * 100).toFixed(1)}% (${lit} of ${solid}), target ${LIT_FRACTION * 100}%`)
  print(`[SH-TEST] skyline: ${front.length}+${back.length} towers, ${g.idx.length / 3} triangles, tallest ${tallest.toFixed(2)} deg, ${opaque} opaque texels, lit ${(frac * 100).toFixed(1)}%`)
}
