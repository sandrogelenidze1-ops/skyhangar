// SkyHangarRouteLook.ts
// Owns: the PURE (no Lens globals) look of the sky route lines and trails by time of day. At night they keep their colour; in the day (and at dusk) they turn a bright,
// minimal neon green (RGB 80, 255, 140), fully opaque with a slight glow and 1.5x thicker, so they read against both the blue day sky and the dusk sky.
// Never dark, no outlines: black is see-through on the additive display.
// Must not: touch the scene (SkyHangarSkyController applies it).

export const ROUTE_NEON: number[] = [80 / 255, 1.0, 140 / 255] // RGB 80, 255, 140
export const DAY_WIDTH_MUL = 1.5 // route / trail line thickness by day
export const DAY_OPACITY_MUL = 2.2 // route / trail opacity by day: enough that even the faint all-routes lines reach full opacity (capped at 1)
export const GLOW_WIDTH_MUL = 2.6 // the soft glow around the line is this much wider than the line
export const GLOW_ALPHA = 0.28 // peak opacity of that glow at full day

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

/** How much of the day look to apply for the Time of Day weights w = [day, dusk, night]: full by day, mostly at dusk (the green reads on the dusk sky too), none at night. Smooth. */
export function dayAmount(w: number[]): number { return clamp01(w[0] + 0.85 * w[1]) }

/** The line colour: the kind's night colour by night, blended toward the neon green with the day amount (0..1). */
export function routeColor(base: number[], day: number): number[] {
  const d = clamp01(day)
  return [0, 1, 2].map((k) => base[k] + (ROUTE_NEON[k] - base[k]) * d)
}
export function routeWidthMul(day: number): number { return 1 + (DAY_WIDTH_MUL - 1) * clamp01(day) }
export function routeOpacityMul(day: number): number { return 1 + (DAY_OPACITY_MUL - 1) * clamp01(day) }

/** Opacity of the soft glow around the lines (0 at night). */
export function routeGlowAlpha(day: number): number { return GLOW_ALPHA * clamp01(day) }
