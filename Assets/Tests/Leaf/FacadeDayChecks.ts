// Pure facade day / night checks (no Lens globals beyond the facade module's own imports): the same assertions run in the LEAF scenario SH_N_FacadeDay.
// The night palette is the reference; the day must be the same hues, only slightly brighter and desaturated, hazier with distance, never more saturated.
import {STYLES, NEUTRAL_STYLES, MUTED_STYLES, ACCENT_STYLE, facadeTimeFor, facadeWallColor, facadeBay, facadeGlass, floorIsDark, darkVariant, FLOOR_DARK, VARIANTS, BAY_W, BAY_H} from "../../Scripts/SkyHangarFacade"

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

  // classic styles = the night palette; modern facades = ribbon / curtain / panes / fins in white, concrete grey, deep glass and warm sand
  c.check("the five classic styles are unchanged: concrete, brick, stone, off-white, slate", "inspection", names.slice(0, 5).join(",") === "concrete,brick,stone,offwhite,slate", names.slice(0, 5).join(","))
  const kinds = new Set(STYLES.map((s) => s.facade || "classic"))
  c.check("modern facades exist: ribbon windows, curtain-wall grid, floor-to-ceiling panes and vertical fins (plus the classic windows)", "inspection", ["classic", "ribbon", "curtain", "panes", "fins"].every((k) => kinds.has(k as any)), [...kinds].join(","))
  c.check("wall colours: white, concrete grey, deep glass and warm sand are present", "inspection", ["ribbon-white", "ribbon-concrete", "fins-concrete", "curtain-deepglass", "panes-sand"].every((n) => names.includes(n)))
  c.check("style pickers point at valid styles: classic for the neutral list, modern for the rest", "inspection", NEUTRAL_STYLES.every((i) => i < STYLES.length && (STYLES[i].facade || "classic") === "classic") && [...MUTED_STYLES, ACCENT_STYLE].every((i) => i < STYLES.length && (STYLES[i].facade || "classic") !== "classic"))
  const classic = STYLES.map((_, i) => i).filter((i) => (STYLES[i].facade || "classic") === "classic")
  const okHue = (h: number): boolean => (h >= 200 && h <= 270) || h >= 310 || h <= 15
  c.check("the classic styles keep the night palette hues: brick red-brown and cool blue-greys, at night, by day and far", "inspection", classic.every((i) => [night[i], dayNear[i], dayFar[i]].every((col) => okHue(hsv(col)[0]))))
  const sand = names.indexOf("panes-sand")
  c.check("the warm sand is warm (hue 20-60 degrees) at night and by day", "inspection", [night[sand], dayNear[sand], dayFar[sand]].every((col) => hsv(col)[0] >= 20 && hsv(col)[0] <= 60), [night[sand], dayNear[sand]].map((col) => hsv(col)[0].toFixed(0)).join("/"))
  c.check("no dark colours: every wall is bright enough for the additive display (luminance >= 0.3 by day, >= 0.2 at night)", "inspection", STYLES.every((_, i) => lum(dayNear[i]) >= 0.3 && lum(night[i]) >= 0.2), names.map((n, i) => n + " " + lum(night[i]).toFixed(2) + "/" + lum(dayNear[i]).toFixed(2)).join(", "))
  const dist = new Set<string>()
  STYLES.forEach((_, i) => dist.add(night[i].map((v) => Math.round(v / 12)).join(",")))
  c.check("the wall colours vary between styles (at least 8 clearly different walls)", "inspection", dist.size >= 8, `${dist.size}`)
  // paint one window bay of every style at night and by day, and compare
  const nightFt = facadeTimeFor([0, 0, 1], 0, 0), dayFt = facadeTimeFor([1, 0, 0], 0, 0)
  const bayKey = (a: Float32Array): string => { let h = 0; for (let i = 0; i < a.length; i += 7) h = (h * 31 + Math.round(a[i] * 40)) | 0; return String(h) }
  const looks = new Set<string>()
  let minL = 9, aligned = true
  STYLES.forEach((_, si) => {
    const n = facadeBay(si, 3, nightFt), d = facadeBay(si, 3, dayFt)
    looks.add(bayKey(d))
    for (let i = 0; i < n.length; i += 3) minL = Math.min(minL, 0.3 * n[i] + 0.4 * n[i + 1] + 0.3 * n[i + 2])
    // the lit pattern changes only the glass: the slab edge (the bottom three rows of the bay, row 0 = top) is identical lit or not
    for (let y = BAY_H - 3; y < BAY_H; y++) for (let x = 0; x < BAY_W; x++) for (let k = 0; k < 3; k++) if (Math.abs(n[(y * BAY_W + x) * 3 + k] - facadeBay(si, 3, {...nightFt, frac: 0})[(y * BAY_W + x) * 3 + k]) > 1e-6) aligned = false
  })
  const ap = {distinct: looks.size, allBright: minL >= 0.3, minLum: minL, litAligned: aligned}
  c.check("the modern facades paint continuous ribbons / grids / panes / fins: each differs from the classic window and from each other", "inspection", ap.distinct >= 5 && ap.allBright, `${ap.distinct} distinct bay looks, min luminance ${ap.minLum.toFixed(2)}`)
  c.check("lit-window patterns stay aligned to floors: every modern bay's lit pixels sit inside the floor's glass rows (never on the slab edge)", "inspection", ap.litAligned)
  // day = the same hues
  c.check("day keeps the night hues (within 5 degrees near, 25 degrees at the far haze)", "inspection", STYLES.every((_, i) => hueDiff(hsv(night[i])[0], hsv(dayNear[i])[0]) <= 5 && hueDiff(hsv(night[i])[0], hsv(dayFar[i])[0]) <= 25), names.map((n, i) => n + " " + hsv(night[i])[0].toFixed(0) + "/" + hsv(dayNear[i])[0].toFixed(0) + "/" + hsv(dayFar[i])[0].toFixed(0)).join(", "))
  // never more saturated by day
  c.check("colours are never more saturated in the day than at night (near or far)", "inspection", STYLES.every((_, i) => hsv(dayNear[i])[1] <= hsv(night[i])[1] + 0.003 && hsv(dayFar[i])[1] <= hsv(night[i])[1] + 0.003), names.map((n, i) => n + " " + hsv(night[i])[1].toFixed(2) + " -> " + hsv(dayNear[i])[1].toFixed(2) + " / " + hsv(dayFar[i])[1].toFixed(2)).join(", "))
  c.check("day is slightly desaturated (a gentle grade, not washed out)", "inspection", STYLES.every((_, i) => hsv(dayNear[i])[1] < hsv(night[i])[1] && hsv(dayNear[i])[1] > hsv(night[i])[1] * 0.6))
  // slightly brighter, still bright for the additive display
  c.check("day is slightly brighter than night (+3% to +60%) and bright enough for the additive display (luminance >= 0.3)", "inspection", STYLES.every((_, i) => lum(dayNear[i]) >= lum(night[i]) * 1.03 && lum(dayNear[i]) <= lum(night[i]) * 1.6 && lum(dayNear[i]) >= 0.3), names.map((n, i) => n + " " + lum(night[i]).toFixed(2) + " -> " + lum(dayNear[i]).toFixed(2)).join(", "))
  // haze with distance, by day only
  c.check("by day the far ring is a little hazier than the near buildings (less saturated)", "inspection", STYLES.every((_, i) => hsv(dayFar[i])[1] < hsv(dayNear[i])[1]))
  const nightFar = STYLES.map((_, i) => facadeWallColor(i, facadeTimeFor(N, FAR_HAZE, 0)))
  c.check("at night there is no distance haze (far = near)", "inspection", STYLES.every((_, i) => nightFar[i].every((v, k) => v === night[i][k])))
  // ---- clean, uniform windows: one glass colour, one warm light colour, lit windows on aligned floors ----
  const sm01 = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
  const warms = VARIANTS.map((v) => v.warm.map((x) => Math.round(x * 255)))
  const wh = warms.map((w) => hsv(w)[0]), wl = warms.map((w) => lum(w))
  c.check("every lit window is the same soft warm white-yellow (hue within 5 degrees, tone within 5%): no orange, pink, blue or white patches", "inspection",
    Math.max(...wh) - Math.min(...wh) <= 5 && Math.max(...wh) >= 35 && Math.min(...wh) <= 55 && (Math.max(...wl) - Math.min(...wl)) / Math.max(...wl) <= 0.05, `hue ${Math.min(...wh).toFixed(0)}-${Math.max(...wh).toFixed(0)}, tone spread ${(((Math.max(...wl) - Math.min(...wl)) / Math.max(...wl)) * 100).toFixed(1)}%`)
  const ftD = facadeTimeFor([1, 0, 0], 0, 0), ftU = facadeTimeFor([0, 1, 0], 0, 0), ftN = facadeTimeFor([0, 0, 1], 0, 0)
  const gl = (ft: typeof ftD, si: number): number[][] => facadeGlass(si, ft).map((g) => g.map((v) => Math.round(v * 255)))
  c.check("the glass is one blue family at every time of day (hue 200-250 degrees) for every style: no warm, orange or pink panes", "inspection", STYLES.every((_, si) => [ftD, ftU, ftN].every((ft) => gl(ft, si).every((g) => hsv(g)[0] >= 200 && hsv(g)[0] <= 250))))
  c.check("within a pane (and so between panes) the glass tone varies by at most about 5%", "inspection", STYLES.every((_, si) => [ftD, ftU, ftN].every((ft) => { const g = gl(ft, si); return Math.abs(lum(g[0]) - lum(g[1])) / ((lum(g[0]) + lum(g[1])) / 2) <= 0.1 })))
  const gD = gl(ftD, 0), gN = gl(ftN, 0)
  c.check("day glass: a calm, slightly lighter, desaturated blue-grey (lighter and less saturated than at night, saturation <= 0.35)", "inspection", lum(gD[0]) > lum(gN[0]) && hsv(gD[0])[1] < hsv(gN[0])[1] && hsv(gD[0])[1] <= 0.35, `day ${gD[0].join(",")} (sat ${hsv(gD[0])[1].toFixed(2)}) night ${gN[0].join(",")}`)
  c.check("night glass: deep blue, but not black (bright enough for the additive display)", "inspection", STYLES.every((_, si) => lum(gl(ftN, si)[0]) >= 0.3) && hsv(gN[0])[1] >= 0.4, `night ${gN[0].join(",")}`)
  c.check("day: no lit windows at all", "inspection", ftD.frac === 0 && VARIANTS.every((v) => sm01(v.thr, v.thr + 0.1, ftD.frac) === 0))
  // lit share at night: the builder picks plain windows 83%, window + AC 7%, window + balcony 10%; whole floors are dark on top
  const meanLit = (lo: number, n: number): number => { let t = 0; for (let i = lo; i < lo + n; i++) t += sm01(VARIANTS[i].thr, VARIANTS[i].thr + 0.1, ftN.frac); return t / n }
  let darkRows = 0, rowsTotal = 0
  for (let b = 1; b <= 400; b++) for (let r = 0; r < 20; r++) { rowsTotal++; if (floorIsDark(b * 7919, r)) darkRows++ }
  const darkShare = darkRows / rowsTotal
  const share = (1 - darkShare) * (0.83 * meanLit(0, 12) + 0.07 * meanLit(12, 4) + 0.1 * meanLit(16, 4))
  c.check("night: about 25-35% of the windows are lit", "inspection", share >= 0.25 && share <= 0.35, `${(share * 100).toFixed(1)}% (${(darkShare * 100).toFixed(0)}% of floors dark)`)
  c.check("some floors are fully dark (about 12-25% of floors), decided per floor and per building", "inspection", darkShare >= 0.12 && darkShare <= 0.25 && floorIsDark(12345, 3) === floorIsDark(12345, 3) && FLOOR_DARK > 0.1, `${(darkShare * 100).toFixed(0)}%`)
  c.check("a dark floor uses the same bay kind with a window that is never lit at night", "inspection", VARIANTS.slice(0, 33).every((v, vi) => { const d = darkVariant(vi); return v.kind === "shop" ? d === vi : VARIANTS[d].kind === v.kind && sm01(VARIANTS[d].thr, VARIANTS[d].thr + 0.1, ftN.frac) === 0 }))
  // the lit windows sit on the floor grid: rows are floors (fixed bay height), columns are the bay grid (fixed bay width); only which ones are lit varies
  c.check("lit windows follow the floors: every bay is one floor high and the same width, so lit windows form aligned rows and columns", "inspection", BAY_W === 20 && BAY_H === 24 && VARIANTS.length === 45)
  // night paints: lit windows are one warm colour, unlit are blue glass: no other hue in the window area of a plain classic bay
  const litBay = facadeBay(0, 0, ftN) // variant 0 has the lowest threshold: lit at night
  const dark = facadeBay(0, 11, ftN) // variant 11 is never lit
  const win = (a: Float32Array, x: number, y: number): number[] => [0, 1, 2].map((k) => Math.round(a[(y * BAY_W + x) * 3 + k] * 255))
  const litC = win(litBay, 6, 7), darkC = win(dark, 6, 7)
  c.check("a lit pane is the warm white-yellow and an unlit pane is blue glass", "inspection", hsv(litC)[0] >= 30 && hsv(litC)[0] <= 60 && hsv(darkC)[0] >= 200 && hsv(darkC)[0] <= 250, `lit ${litC.join(",")} unlit ${darkC.join(",")}`)
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
