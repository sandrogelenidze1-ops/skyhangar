// Pure route-colour checks (no Lens globals) so the same assertions run in the LEAF scenario SH_N_RouteDay and in plain Node.
// Night keeps the current colours; by day the route lines and trails are saturated warm amber (255, 150, 40), 1.5x thicker, more opaque, never dark,
// and everything interpolates smoothly with the time of day.
import {ROUTE_AMBER, DAY_WIDTH_MUL, DAY_OPACITY_MUL, dayAmount, routeColor, routeWidthMul, routeOpacityMul} from "../../Scripts/SkyHangarRouteLook"

export interface Check {
  check(name: string, input: "inspection", pass: boolean, detail?: string): boolean
}

// the kinds' night trail colours (SkyHangarSkyController TRAIL_RGB)
const KINDS: {[k: string]: number[]} = {plane: [1.0, 0.698, 0.478], helicopter: [0.498, 0.89, 0.69], satellite: [0.498, 0.839, 1.0]}
const lum = (c: number[]): number => 0.3 * c[0] + 0.4 * c[1] + 0.3 * c[2]
const hue = (c: number[]): number => {
  const [r, g, b] = c
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  if (d === 0) return 0
  let h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return h * 60
}
const sat = (c: number[]): number => (Math.max(...c) - Math.min(...c)) / Math.max(...c)

export function runRouteDayChecks(c: Check, print: (s: string) => void): void {
  const night = [0, 0, 1], dusk = [0, 1, 0], day = [1, 0, 0]
  c.check("the day amount is 0 at night, 1 by day and in between at dusk", "inspection", dayAmount(night) === 0 && dayAmount(day) === 1 && dayAmount(dusk) > 0 && dayAmount(dusk) < 1, `${dayAmount(night)} / ${dayAmount(dusk)} / ${dayAmount(day)}`)
  c.check("night: every kind keeps its current colour, thickness and opacity", "inspection", Object.keys(KINDS).every((k) => routeColor(KINDS[k], dayAmount(night)).every((v, i) => v === KINDS[k][i])) && routeWidthMul(0) === 1 && routeOpacityMul(0) === 1)
  const amber = routeColor(KINDS.plane, 1)
  c.check("day: a saturated warm amber / orange, RGB 255, 150, 40", "inspection", amber.map((v) => Math.round(v * 255)).join(",") === "255,150,40" && ROUTE_AMBER.every((v, i) => v === amber[i]), amber.map((v) => Math.round(v * 255)).join(","))
  c.check("day: the same amber for every kind of trail (plane, helicopter, satellite)", "inspection", Object.keys(KINDS).every((k) => routeColor(KINDS[k], 1).every((v, i) => Math.abs(v - ROUTE_AMBER[i]) < 1e-9)))
  c.check("day: about 1.5x thicker and with higher opacity", "inspection", Math.abs(routeWidthMul(1) - 1.5) < 1e-9 && DAY_WIDTH_MUL === 1.5 && routeOpacityMul(1) > 1.2 && routeOpacityMul(1) === DAY_OPACITY_MUL, `width x${routeWidthMul(1)}, opacity x${routeOpacityMul(1)}`)
  // contrast with the blue day sky (about 150, 210, 255)
  const sky = [150 / 255, 210 / 255, 1]
  const dh = Math.abs(hue(amber) - hue(sky)), hueGap = Math.min(dh, 360 - dh)
  c.check("day: contrasts with the blue sky (hue at least 120 degrees away, saturated)", "inspection", hueGap >= 120 && sat(amber) >= 0.8, `hue gap ${hueGap.toFixed(0)}, saturation ${sat(amber).toFixed(2)}`)
  // never dark: no black or dark outline; every blend stays bright (black is see-through on the additive display)
  let minL = 9, smooth = true
  let prev: number[] | null = null, prevW = 0, prevO = 0
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    const w = t <= 0.5 ? [1 - t * 2, t * 2, 0] : [0, 1 - (t - 0.5) * 2, (t - 0.5) * 2] // day -> dusk -> night
    const d = dayAmount(w)
    for (const k of Object.keys(KINDS)) {
      const col = routeColor(KINDS[k], d)
      minL = Math.min(minL, lum(col))
      if (k === "plane") {
        if (prev && (Math.hypot(col[0] - prev[0], col[1] - prev[1], col[2] - prev[2]) > 0.2 || Math.abs(routeWidthMul(d) - prevW) > 0.2 || Math.abs(routeOpacityMul(d) - prevO) > 0.2)) smooth = false
        prev = col; prevW = routeWidthMul(d); prevO = routeOpacityMul(d)
      }
    }
  }
  c.check("never dark: every colour on the way keeps a luminance of at least 0.55 (no black, no dark outline)", "inspection", minL >= 0.55, minL.toFixed(2))
  c.check("colour, thickness and opacity interpolate smoothly with the time of day", "inspection", smooth)
  let monoDay = true, last = -1
  for (let i = 0; i <= 20; i++) { const t = i / 20; const w = t <= 0.5 ? [1 - t * 2, t * 2, 0] : [0, 1 - (t - 0.5) * 2, (t - 0.5) * 2]; const d = dayAmount(w); if (last >= 0 && d > last + 1e-9) monoDay = false; last = d }
  c.check("going from day to night the day amount only falls", "inspection", monoDay)
  print("[SH-TEST] route day look: amber " + amber.map((v) => Math.round(v * 255)).join(",") + ", width x" + routeWidthMul(1) + ", opacity x" + routeOpacityMul(1))
}
