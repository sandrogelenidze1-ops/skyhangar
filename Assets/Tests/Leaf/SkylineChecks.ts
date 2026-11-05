// Pure skyline checks (no Lens globals) so the same assertions run in the LEAF scenario SH_N_Skyline and in plain Node.
import {COL_FRONT, COL_BACK, tone, skylineTowers, paintSkyline, stripGeometry, towerTotal, towerGrid, towerPrims, skylineLook, rowElevation, SKY_MAX_EL, SKY_FRONT_MAX_EL, TEX_W, TEX_H, STRIP_R, COL_PITCH, POLE_BASE_PX, POLE_BASE_CM, PX_PER_DEG} from "../../Scripts/SkyHangarSkylineSpec"

export interface Check {
  check(name: string, input: "inspection", pass: boolean, detail?: string): boolean
}

const RING_C_FAR_EDGE = 4600 * 1.03 + 130 // farthest face of the existing far ring
const SKY_DOME = 6000
const lum = (r: number, g: number, b: number): number => 0.3 * r + 0.4 * g + 0.3 * b

export function runSkylineChecks(c: Check, print: (s: string) => void): void {
  const towers = skylineTowers()
  const front = towers.filter((t) => !t.back), back = towers.filter((t) => t.back)
  c.check("8-12 towers in total (twin towers count as one) with a lower back row", "inspection", towers.length >= 8 && towers.length <= 12 && back.length >= 2 && back.length <= 4, `${front.length} front + ${back.length} back`)
  const forms = new Set(front.map((t) => t.form))
  const want = ["wedding", "pyramid", "slant", "twin", "round", "notch", "spire", "podium", "lean"]
  c.check("nine distinct forms: stepped, pyramid crown, slanted roof, twin + bridge, rounded top, notched, spire, podium + slim tower, leaning", "inspection", want.every((f) => (forms as Set<string>).has(f)), [...forms].join(","))
  c.check("not plain rectangles: no front tower is a box", "inspection", front.filter((t) => t.form === "box").length === 0)
  const painted = paintSkyline(towers)
  c.check("deterministic (two paints identical)", "inspection", (() => {
    const p2 = paintSkyline(skylineTowers())
    for (let i = 0; i < painted.sil.length; i++) if (painted.sil[i] !== p2.sil[i] || painted.lights[i] !== p2.lights[i]) return false
    return JSON.stringify(towers) === JSON.stringify(skylineTowers())
  })())

  // poles: very thin, tapering to a point, tiny red beacon on top
  const poles = towers.filter((t) => t.pole > 0)
  const nBeacons = towers.filter((t) => t.beacon).length
  c.check("2-3 red beacons, each on a pole", "inspection", nBeacons >= 2 && nBeacons <= 3 && towers.filter((t) => t.beacon).every((t) => t.pole > 0), `${nBeacons}`)
  c.check(`poles are very thin: ${POLE_BASE_PX} texels at the foot (~${POLE_BASE_CM.toFixed(0)} cm), tapering to a point`, "inspection", POLE_BASE_PX <= 2.5 && poles.every((t) => {
    const pr = towerPrims(t).filter((p) => p.pole)[0].poly as number[]
    return pr.length === 6 && Math.abs(pr[2] - pr[0]) <= 2.5 && pr[4] >= pr[0] && pr[4] <= pr[2] // 3 points: base <= 2.5 texels wide, apex above it
  }))
  c.check("painted poles are 1-3 texels wide", "inspection", poles.every((t) => {
    const roofY = towerPrims(t).filter((p) => !p.pole).reduce((m, p) => Math.max(m, p.y1), 0)
    const cx = (((t.az % 360) + 360) % 360) * PX_PER_DEG
    let widest = 0
    for (let r = Math.ceil(roofY) + 2; r < Math.ceil(roofY) + 12 && r < TEX_H; r++) {
      let n = 0
      for (let x = Math.floor(cx) - 6; x <= Math.floor(cx) + 6; x++) if (painted.sil[(r * TEX_W + x) * 4 + 3] > 110) n++
      widest = Math.max(widest, n)
    }
    return widest >= 1 && widest <= 3
  }))
  c.check("beacons are tiny (3 x 3 texels), one per beacon pole", "inspection", painted.beaconPx.length === nBeacons)
  const tallest = Math.max(...towers.map(towerTotal))
  c.check(`tallest point (pole tip included) <= ${SKY_MAX_EL} degrees, most of the sky stays clear`, "inspection", tallest <= SKY_MAX_EL, `${tallest.toFixed(2)}`)
  const ahead = front.filter((t) => Math.abs((((t.az + 180) % 360) + 360) % 360 - 180) - t.w / 2 < 30)
  c.check(`roofs in the central 60 degrees ahead stay <= ${SKY_FRONT_MAX_EL} degrees`, "inspection", ahead.every((t) => t.top <= SKY_FRONT_MAX_EL + 1e-6), `${ahead.length} ahead`)
  c.check("back row is lower than the tallest front towers", "inspection", Math.max(...back.map((t) => t.top)) < Math.max(...front.map((t) => t.top)))

  // lights follow the floors
  let aligned = true, rowsOk = true
  const perTower = new Map<number, {xs: Set<number>; rs: Set<number>}>()
  for (let i = 0; i < painted.litPx.length; i += 3) {
    const ti = painted.litPx[i]
    if (!perTower.has(ti)) perTower.set(ti, {xs: new Set<number>(), rs: new Set<number>()})
    perTower.get(ti)!.xs.add(painted.litPx[i + 1])
    perTower.get(ti)!.rs.add(painted.litPx[i + 2])
  }
  for (const [ti, v] of perTower) {
    const g = towerGrid(towers[ti])
    for (const x of v.xs) if ((((x - g.xLeft) % COL_PITCH) + COL_PITCH) % COL_PITCH !== 1) aligned = false // the same columns on every floor
    for (const r of v.rs) if ((r - g.r0) % g.pitch !== 0) rowsOk = false // regular floor spacing
  }
  const pitchOk = towers.every((t) => towerGrid(t).pitch === (t.back ? 8 : 4))
  c.check("lights sit in horizontal floor rows at a regular spacing (every floor in front, every second floor on the far row)", "inspection", rowsOk && pitchOk && perTower.size >= 8, `${perTower.size} towers lit`)
  c.check("window columns are aligned between floors (fixed 4-texel pitch, 2-texel dashes)", "inspection", aligned)
  const frac = painted.lit / Math.max(1, painted.windows)
  c.check("about 30-50% of the windows are lit", "inspection", frac >= 0.28 && frac <= 0.52, `${(frac * 100).toFixed(1)}% (${painted.lit} of ${painted.windows})`)
  c.check("some floors are entirely dark", "inspection", painted.darkFloors >= 5, `${painted.darkFloors} dark floors`)
  c.check("a few towers have a lit office band", "inspection", towers.filter((t) => t.band).length >= 2 && towers.filter((t) => t.band).length <= 4)
  let maxA = 0
  for (let i = 0; i < painted.litPx.length; i += 3) maxA = Math.max(maxA, painted.lights[(painted.litPx[i + 2] * TEX_W + painted.litPx[i + 1]) * 4 + 3])
  c.check("lights are tiny and dim (2 x 1 texel dashes, alpha <= 0.85)", "inspection", maxA > 0 && maxA <= 217, `max alpha ${maxA}`)

  // geometry: low poly, far away, inside the dome
  const g = stripGeometry()
  c.check("two low-poly strips (<= 400 triangles each)", "inspection", g.idx.length / 3 <= 400, `${g.idx.length / 3} each`)
  c.check("strips stand beyond the existing far ring and inside the sky dome", "inspection", STRIP_R > RING_C_FAR_EDGE + 400 && STRIP_R < SKY_DOME - 200, `${STRIP_R}`)

  // silhouette texture
  let minLum = 9, aboveMax = 0
  const mid: number[][] = []
  for (let r = 0; r < TEX_H; r++) {
    const el = rowElevation(r)
    for (let x = 0; x < TEX_W; x++) {
      const o = (r * TEX_W + x) * 4
      const a = painted.sil[o + 3]
      if (a > 25) minLum = Math.min(minLum, lum(painted.sil[o] / 255, painted.sil[o + 1] / 255, painted.sil[o + 2] / 255))
      if (el > SKY_MAX_EL + 0.4 && (a > 0 || painted.lights[o + 3] > 0)) aboveMax++
      if (a === 255 && el > 2.4 && el < 3.0) mid.push([painted.sil[o], painted.sil[o + 1], painted.sil[o + 2]])
    }
  }
  c.check("nothing is painted above the tallest pole (sky stays clear)", "inspection", aboveMax === 0, `${aboveMax} texels`)
  c.check("no black: every visible silhouette texel luminance >= 0.12", "inspection", minLum >= 0.12, `min ${minLum.toFixed(3)}`)
  c.check("authored silhouette colour is a deep dusky violet-blue (R 60-85, G 55-75, B 140-170); back row lighter", "inspection",
    COL_FRONT[0] * 255 >= 60 && COL_FRONT[0] * 255 <= 85 && COL_FRONT[1] * 255 >= 55 && COL_FRONT[1] * 255 <= 75 && COL_FRONT[2] * 255 >= 140 && COL_FRONT[2] * 255 <= 170 && lum(COL_BACK[0], COL_BACK[1], COL_BACK[2]) > lum(COL_FRONT[0], COL_FRONT[1], COL_FRONT[2]),
    COL_FRONT.map((v) => Math.round(v * 255)).join(", "))
  mid.sort((a, b) => a[2] - b[2])
  const med = mid.length ? mid[Math.floor(mid.length / 2)] : [0, 0, 0]
  const shown = med.map((v) => 80 + (175 * v) / 255) // what the preview shows for a texel: about 80 + 175 c
  const skyL = lum(100 / 255, 100 / 255, 1), shownL = lum(shown[0] / 255, shown[1] / 255, shown[2] / 255)
  c.check("at night the silhouette is clearly darker than the horizon sky and not black", "inspection", shownL <= skyL * 0.88 && shownL >= 0.3 && shown[2] < 235, `shown ~${shown.map(Math.round).join(", ")} vs sky 100, 100, 255; toned ${tone(COL_FRONT).map((v) => v.toFixed(2)).join(", ")}`)

  // night only: lights and beacons by time of day, silhouette lightened and hazed by day
  const day = skylineLook([1, 0, 0], 0), dusk = skylineLook([0, 1, 0], 0.3), night = skylineLook([0, 0, 1], 1)
  c.check("day: all window lights and beacons off", "inspection", day.lightAlpha === 0)
  c.check("night: lights and beacons fully on", "inspection", night.lightAlpha === 1)
  c.check("day: silhouette lightened and hazed (alpha <= 0.45), night fully dark, dusk in between", "inspection", day.silAlpha <= 0.45 && night.silAlpha === 1 && dusk.silAlpha > day.silAlpha && dusk.silAlpha < night.silAlpha, `${day.silAlpha.toFixed(2)} / ${dusk.silAlpha.toFixed(2)} / ${night.silAlpha.toFixed(2)}`)
  let smooth = true, prevL = -1, prevA = -1
  for (let i = 0; i <= 20; i++) { // sweep day -> dusk -> night: both values only ever grow, in small steps
    const t = i / 20
    const w = t <= 0.5 ? [1 - t * 2, t * 2, 0] : [0, 1 - (t - 0.5) * 2, (t - 0.5) * 2]
    const lk = skylineLook(w, Math.max(0, Math.min(1, (t - 0.3) / 0.55)))
    if (prevL >= 0 && (lk.lightAlpha < prevL - 1e-9 || lk.silAlpha < prevA - 1e-9 || lk.lightAlpha - prevL > 0.2 || lk.silAlpha - prevA > 0.2)) smooth = false
    prevL = lk.lightAlpha; prevA = lk.silAlpha
  }
  c.check("lights and haze interpolate smoothly with the time of day", "inspection", smooth)
  print(`[SH-TEST] skyline: ${front.length}+${back.length} towers, ${forms.size} forms, ${painted.lit}/${painted.windows} windows lit (${(frac * 100).toFixed(0)}%), tallest ${tallest.toFixed(2)} deg`)
}
