// Pure route-look checks (no Lens globals) so the same assertions run in the LEAF scenario SH_N_RouteDay and in plain Node.
// Colour is fixed per vehicle type and identical day and night (plane neon green 80,255,140; satellite neon cyan 0,240,255; helicopter yellow 255,215,40),
// shared by the route line, the dotted trail and the radar trail. Only thickness / opacity follow the time of day (by day and at dusk: fully opaque, 1.5x thicker). No glow.
// The selected sky trail is 1.3x the normal one, and radar aircraft fade out smoothly beyond the circle instead of sitting on the border.
import {ROUTE_NEON, ROUTE_COLORS, DAY_WIDTH_MUL, DAY_OPACITY_MUL, PINNED_WIDTH, EDGE_FADE, dayAmount, routeColor, routeWidthMul, routeOpacityMul, edgeFade} from "../../Scripts/SkyHangarRouteLook"

export interface Check {
  check(name: string, input: "inspection", pass: boolean, detail?: string): boolean
}

const KINDS = ["plane", "helicopter", "satellite"]
const rgb255 = (c: number[]): string => c.map((v) => Math.round(v * 255)).join(",")
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
  c.check("the day amount is 0 at night, 1 by day and in between (mostly on) at dusk", "inspection", dayAmount(night) === 0 && dayAmount(day) === 1 && dayAmount(dusk) > 0 && dayAmount(dusk) < 1, `${dayAmount(night)} / ${dayAmount(dusk)} / ${dayAmount(day)}`)

  // colours by type
  c.check("planes keep the bright neon green, RGB 80, 255, 140", "inspection", rgb255(routeColor("plane")) === "80,255,140" && ROUTE_NEON.every((v, i) => v === routeColor("plane")[i]), rgb255(routeColor("plane")))
  c.check("satellites are a light azure (#B8F2FF), RGB 184, 242, 255", "inspection", rgb255(routeColor("satellite")) === "184,242,255", rgb255(routeColor("satellite")))
  c.check("helicopters are yellow, RGB 255, 215, 40", "inspection", rgb255(routeColor("helicopter")) === "255,215,40", rgb255(routeColor("helicopter")))
  const distinct = KINDS.every((a) => KINDS.every((b) => a === b || Math.hypot(...routeColor(a).map((v, i) => v - routeColor(b)[i])) > 0.5))
  c.check("the three types have clearly different colours", "inspection", distinct)
  c.check("an unknown type falls back to the plane colour", "inspection", routeColor("x").every((v, i) => v === ROUTE_COLORS.plane[i]))
  // the colour is a function of the type only: there is no time-of-day input at all
  c.check("the colour does not depend on the time of day (routeColor takes only the type)", "inspection", routeColor.length === 1)

  // thickness / opacity still follow the day
  c.check("night: thickness and opacity are the base values", "inspection", routeWidthMul(0) === 1 && routeOpacityMul(0) === 1)
  c.check("day: 1.5x thicker", "inspection", Math.abs(routeWidthMul(1) - 1.5) < 1e-9 && DAY_WIDTH_MUL === 1.5, `x${routeWidthMul(1)}`)
  c.check("day: fully opaque (the all-routes lines, 0.55 x 0.9 peak, and the main trail both reach full opacity)", "inspection", routeOpacityMul(1) === DAY_OPACITY_MUL && 0.55 * 0.9 * routeOpacityMul(1) >= 1 && 0.9 * routeOpacityMul(1) >= 1, `x${routeOpacityMul(1)}`)

  // readable against the day sky (about 150, 210, 255) and the dusk sky (about 150, 90, 200); never dark (black is see-through on the additive display)
  const neon = routeColor("plane"), daySky = [150 / 255, 210 / 255, 1], duskSky = [150 / 255, 90 / 255, 200 / 255]
  const gap = (a: number[], b: number[]): number => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d) }
  c.check("planes: a saturated, bright green that stands apart from the day and dusk skies", "inspection", sat(neon) >= 0.65 && lum(neon) >= 0.6 && gap(neon, daySky) >= 40 && gap(neon, duskSky) >= 80, `sat ${sat(neon).toFixed(2)}, lum ${lum(neon).toFixed(2)}`)
  c.check("every type colour is bright, never dark (luminance >= 0.55)", "inspection", KINDS.every((k) => lum(routeColor(k)) >= 0.55), KINDS.map((k) => k + " " + lum(routeColor(k)).toFixed(2)).join(", "))
  const blue = routeColor("satellite")
  c.check("satellites: a saturated azure (little red) that is far more saturated than the light day sky, drawn as the same single line as the other types", "inspection", blue[0] <= 0.1 && sat(blue) >= 0.9 && sat(blue) - sat(daySky) >= 0.5, `sat ${sat(blue).toFixed(2)}`)

  // selected trail
  c.check("the selected (picked / pinned) sky trail (every vehicle type, satellites too) is about 1.3x the normal one", "inspection", Math.abs(PINNED_WIDTH - 1.3) < 0.05, `x${PINNED_WIDTH}`)

  // radar edge fade
  const R = 20
  c.check("radar: fully visible while the nose is inside the circle and at the circle", "inspection", edgeFade(0, R) === 1 && edgeFade(R * 0.99, R) === 1 && edgeFade(R, R) === 1)
  c.check("radar: gone once the nose is about 7% of the radius beyond the circle (6-8%)", "inspection", EDGE_FADE >= 0.06 && EDGE_FADE <= 0.08 && edgeFade(R * (1 + EDGE_FADE), R) === 0 && edgeFade(R * 1.2, R) === 0)
  let monotone = true, smoothF = true, prevF = 1
  for (let i = 0; i <= 100; i++) {
    const f = edgeFade(R + (i / 100) * EDGE_FADE * R, R)
    if (f > prevF + 1e-12) monotone = false
    if (prevF - f > 0.06) smoothF = false // no jumps: at most 6% per 1% of the fade band
    prevF = f
  }
  c.check("radar: the fade only falls going outward, in small steps (smooth, no pop)", "inspection", monotone && smoothF)
  c.check("radar: half way through the band it is about half visible, and it fades back in on re-entry (a pure function of the position)", "inspection", Math.abs(edgeFade(R * (1 + EDGE_FADE / 2), R) - 0.5) < 0.02 && edgeFade(R * (1 + EDGE_FADE / 2), R) === edgeFade(R * (1 + EDGE_FADE / 2), R))

  print("[SH-TEST] route look: plane " + rgb255(neon) + ", satellite " + rgb255(blue) + ", helicopter " + rgb255(routeColor("helicopter")) + "; day width x" + routeWidthMul(1) + ", selected x" + PINNED_WIDTH + ", radar fade band " + EDGE_FADE)
}
