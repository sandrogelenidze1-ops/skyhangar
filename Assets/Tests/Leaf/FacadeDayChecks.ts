// Pure facade day / night checks (no Lens globals beyond the facade module's own imports): the same assertions run in the LEAF scenario SH_N_FacadeDay.
// The night palette is the reference; the day must be the same hues, only slightly brighter and desaturated, hazier with distance, never more saturated.
import {STYLES, NEUTRAL_STYLES, MUTED_STYLES, ACCENT_STYLE, facadeTimeFor, facadeWallColor} from "../../Scripts/SkyHangarFacade"

export interface Check {
  check(name: string, input: "inspection", pass: boolean, detail?: string): boolean
}

const hsv = (c: number[]): number[] => {
  const [r, g, b] = c.map((v) => v / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h = 0
  if (d > 0) { if (mx === r) h = ((g - b) / d + 6) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60 }
  return [h, mx ? d / mx : 0, mx]
}
const lum = (c: number[]): number => (0.3 * c[0] + 0.4 * c[1] + 0.3 * c[2]) / 255
const hueDiff = (a: number, b: number): number => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d) }
const FAR_HAZE = 0.22 // the far atlas' haze at full day (SkyHangarRooftopBackdrop ATLAS_HAZE[1])
const NEAR_HAZE = 0.06

export function runFacadeDayChecks(c: Check, print: (s: string) => void): void {
  const N = [0, 0, 1], D = [1, 0, 0]
  const night = STYLES.map((_, i) => facadeWallColor(i, facadeTimeFor(N, 0, 0)))
  const dayNear = STYLES.map((_, i) => facadeWallColor(i, facadeTimeFor(D, NEAR_HAZE, 0)))
  const dayFar = STYLES.map((_, i) => facadeWallColor(i, facadeTimeFor(D, FAR_HAZE, 0)))
  const names = STYLES.map((s) => s.name)

  c.check("only the night palette's wall styles remain: concrete, brick, stone, off-white (light grey-blue), slate (soft blue-grey)", "inspection", names.join(",") === "concrete,brick,stone,offwhite,slate", names.join(","))
  c.check("style pickers only point at those styles", "inspection", [...NEUTRAL_STYLES, ...MUTED_STYLES, ACCENT_STYLE].every((i) => i >= 0 && i < STYLES.length))
  // no orange, green or sand: every wall hue is a red-brown (brick) or a blue-grey, at night and by day
  const okHue = (h: number): boolean => (h >= 200 && h <= 270) || h >= 310 || h <= 15
  const allHues = [night, dayNear, dayFar].flatMap((set) => set.map((col) => hsv(col)[0]))
  c.check("no orange, green or sand walls: every hue (night, day, far day) is brick red-brown or blue-grey", "inspection", allHues.every(okHue), allHues.map((h) => h.toFixed(0)).join(" "))
  c.check("the night colours are brick red-brown and cool blue-greys", "inspection", STYLES.every((s, i) => s.name === "brick" ? (hsv(night[i])[0] >= 310 || hsv(night[i])[0] <= 15) : (hsv(night[i])[0] >= 200 && hsv(night[i])[0] <= 270)))
  // day = the same hues
  c.check("day keeps the night hues (within 5 degrees near, 20 degrees at the far haze)", "inspection", STYLES.every((_, i) => hueDiff(hsv(night[i])[0], hsv(dayNear[i])[0]) <= 5 && hueDiff(hsv(night[i])[0], hsv(dayFar[i])[0]) <= 20), names.map((n, i) => n + " " + hsv(night[i])[0].toFixed(0) + "/" + hsv(dayNear[i])[0].toFixed(0) + "/" + hsv(dayFar[i])[0].toFixed(0)).join(", "))
  // never more saturated by day
  c.check("colours are never more saturated in the day than at night (near or far)", "inspection", STYLES.every((_, i) => hsv(dayNear[i])[1] <= hsv(night[i])[1] + 0.003 && hsv(dayFar[i])[1] <= hsv(night[i])[1] + 0.003), names.map((n, i) => n + " " + hsv(night[i])[1].toFixed(2) + " -> " + hsv(dayNear[i])[1].toFixed(2) + " / " + hsv(dayFar[i])[1].toFixed(2)).join(", "))
  c.check("day is slightly desaturated (a gentle grade, not washed out)", "inspection", STYLES.every((_, i) => hsv(dayNear[i])[1] < hsv(night[i])[1] && hsv(dayNear[i])[1] > hsv(night[i])[1] * 0.6))
  // slightly brighter, still bright for the additive display
  c.check("day is slightly brighter than night (+3% to +60%) and bright enough for the additive display (luminance >= 0.3)", "inspection", STYLES.every((_, i) => lum(dayNear[i]) >= lum(night[i]) * 1.03 && lum(dayNear[i]) <= lum(night[i]) * 1.6 && lum(dayNear[i]) >= 0.3), names.map((n, i) => n + " " + lum(night[i]).toFixed(2) + " -> " + lum(dayNear[i]).toFixed(2)).join(", "))
  // haze with distance, by day only
  c.check("by day the far ring is a little hazier than the near buildings (less saturated)", "inspection", STYLES.every((_, i) => hsv(dayFar[i])[1] < hsv(dayNear[i])[1]))
  const nightFar = STYLES.map((_, i) => facadeWallColor(i, facadeTimeFor(N, FAR_HAZE, 0)))
  c.check("at night there is no distance haze (far = near)", "inspection", STYLES.every((_, i) => nightFar[i].every((v, k) => v === night[i][k])))
  // smooth with the time of day
  let smooth = true, mono = true
  const prev: number[][] = []
  for (let k = 0; k <= 20; k++) {
    const t = k / 20
    const w = t <= 0.5 ? [1 - t * 2, t * 2, 0] : [0, 1 - (t - 0.5) * 2, (t - 0.5) * 2] // day -> dusk -> night
    STYLES.forEach((_, i) => {
      const col = facadeWallColor(i, facadeTimeFor(w, NEAR_HAZE, 0))
      const h = hsv(col)
      if (prev[i]) {
        if (Math.abs(lum(col) - prev[i][0]) > 0.04 || Math.abs(h[1] - prev[i][1]) > 0.05 || hueDiff(h[0], prev[i][2]) > 3) smooth = false
        if (h[1] < prev[i][1] - 0.003 || lum(col) > prev[i][0] + 0.003) mono = false // going day -> night: saturation only rises, brightness only falls
      }
      prev[i] = [lum(col), h[1], h[0]]
    })
  }
  c.check("the transition with the time of day is smooth (small steps in brightness, saturation and hue)", "inspection", smooth)
  c.check("going from day to night saturation only rises and brightness only falls (no hue-shifting dusk)", "inspection", mono)
  print("[SH-TEST] facade day/night: " + names.map((n, i) => n + " L " + lum(night[i]).toFixed(2) + "->" + lum(dayNear[i]).toFixed(2) + " S " + hsv(night[i])[1].toFixed(2) + "->" + hsv(dayNear[i])[1].toFixed(2)).join("; "))
}
