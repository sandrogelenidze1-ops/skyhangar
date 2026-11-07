// SkyHangarRoofLook.ts
// Owns: the PURE (no Lens globals) time-of-day light on the rooftop objects. ONE base palette (the albedos in SkyHangarRooftopBackdrop: purple-grey floor, bluish walls,
// teal tank, dark-blue steel) is lit by a light that depends on the phase. The MORNING light is the base at every day / dusk phase; sunrise, midday, afternoon and sunset
// change it only by a few percent (a warm tint of ~3% R-vs-B, brightness -3%), so no rooftop object ever turns sandy / brown / orange.
// Night is the cool night light, exactly as before. Weights w = [day, dusk, night].

/** Night horizon colour the roof's ambient takes a little of (the sky script's night horizon). */
const NIGHT_HORIZON = [0.45, 0.08, 0.74]
/** Morning light (the base at every phase except night): bright, a touch warmer than the night ambient, hues stay violet-blue. */
export const ROOF_LIGHT_DAY = [0.52, 0.55, 0.95]
/** Night light, exactly as it was: 0.6 x (cool ambient 70% + night horizon 30%). */
export const ROOF_LIGHT_NIGHT = [0, 1, 2].map((k) => 0.6 * ([0.42, 0.52, 1.0][k] * 0.7 + NIGHT_HORIZON[k] * 0.3))
/** Sunset / sunrise: the morning light with a barely visible warm tint (red +1.5%, blue -1.5%, about 3% warm: well under the 10% allowed) and 3% less brightness.
 * Measured on every rooftop material: no material's hue moves more than ~3.5 degrees from its morning hue (a larger tint, e.g. 5%, moved the pale parapet cap by 17 degrees). */
export const ROOF_LIGHT_DUSK = [ROOF_LIGHT_DAY[0] * 1.015 * 0.97, ROOF_LIGHT_DAY[1] * 0.97, ROOF_LIGHT_DAY[2] * 0.985 * 0.97]

/** Roof light multiplier [r, g, b] for the time weights. */
export function roofLightFor(w: number[]): number[] {
  return [0, 1, 2].map((k) => ROOF_LIGHT_DAY[k] * w[0] + ROOF_LIGHT_DUSK[k] * w[1] + ROOF_LIGHT_NIGHT[k] * w[2])
}

/** Warm rim light on the lit edges: the morning amount at every day / dusk phase (no stronger sunset rim), none at night. */
export function roofRimFor(w: number[]): number {
  return 0.1 * (w[0] + w[1])
}
