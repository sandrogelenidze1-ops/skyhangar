// SkyHangarRouteLook.ts
// Owns: the PURE (no Lens globals) look of the sky route lines and trails. The COLOUR is fixed per vehicle type and never changes with the time of day:
// planes bright neon green (RGB 80, 255, 140), satellites neon cyan (0, 240, 255; always fully opaque), helicopters yellow (255, 215, 40). The same colour is
// used for a flight's route line, its dotted trail and its radar trail. Only the thickness / opacity follow the time of day (by day, and at dusk, the lines are
// fully opaque and 1.5x thicker, so they read against the sky). Lines are plain crisp solid strips: no glow, halo or soft edge.
// Never dark, no outlines: black is see-through on the additive display.
// Must not: touch the scene (SkyHangarSkyController applies it).

export const SATELLITE_RGB255: number[] = [184, 242, 255] // satellite trail colour (#B8F2FF), a light azure: the one place to tweak it (line, dots, selected state). WCAG contrast >= 1.82:1 against the day sky (#3F7CF0..#6BB3F8), the dusk sky and the night sky (#6464F8, #8B5CF6); #66CCFF only reaches 1.24:1 on #6BB3F8
export const ROUTE_NEON: number[] = [80 / 255, 1.0, 140 / 255] // RGB 80, 255, 140 (planes)
export const ROUTE_COLORS: {[kind: string]: number[]} = {
  plane: ROUTE_NEON,
  satellite: SATELLITE_RGB255.map((v) => v / 255), // bright azure
  helicopter: [1.0, 215 / 255, 40 / 255] // RGB 255, 215, 40
}
export const DAY_WIDTH_MUL = 1.5 // route / trail line thickness by day
export const DAY_OPACITY_MUL = 2.2 // route / trail opacity by day: enough that even the faint all-routes lines reach full opacity (capped at 1)

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

/** How much of the day look to apply for the Time of Day weights w = [day, dusk, night]: full by day, mostly at dusk (the green reads on the dusk sky too), none at night. Smooth. */
export function dayAmount(w: number[]): number { return clamp01(w[0] + 0.85 * w[1]) }

/** The line / dot / radar-trail colour of a vehicle type: the same at every time of day. */
export function routeColor(kind: string): number[] { return ROUTE_COLORS[kind] ?? ROUTE_COLORS.plane }
export function routeWidthMul(day: number): number { return 1 + (DAY_WIDTH_MUL - 1) * clamp01(day) }
export function routeOpacityMul(day: number): number { return 1 + (DAY_OPACITY_MUL - 1) * clamp01(day) }

/** Selected (pinned) sky trail thickness vs a normal / aimed one (about 1.3x; it also gets the slight PINNED_BOOST brightness in the sky controller). */
export const PINNED_WIDTH = 1.3 // the same for every vehicle type

/** Radar edge: an aircraft fades out over this fraction of the radar radius beyond the circle. */
export const EDGE_FADE = 0.07
/** Opacity (1 .. 0) of a radar aircraft and its trail from the distance of its NOSE from the radar centre and the radar radius (same units): 1 inside the circle, 0 EDGE_FADE of the radius beyond it. */
export function edgeFade(noseDist: number, radius: number): number {
  const t = clamp01((noseDist - radius) / (EDGE_FADE * radius))
  return 1 - t * t * (3 - 2 * t)
}
