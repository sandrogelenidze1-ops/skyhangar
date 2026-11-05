// SkyHangarRouteLook.ts
// Owns: the PURE (no Lens globals) look of the sky route lines and trails by time of day. At night they keep their colour; in the day they turn a saturated
// warm amber (RGB 255, 150, 40) that stands out from the bright blue sky, slightly thicker and more opaque. Never dark: black is see-through on the additive display.
// Must not: touch the scene (SkyHangarSkyController applies it).

export const ROUTE_AMBER: number[] = [1.0, 150 / 255, 40 / 255] // RGB 255, 150, 40
export const DAY_WIDTH_MUL = 1.5 // route / trail line thickness by day
export const DAY_OPACITY_MUL = 1.4 // route / trail opacity by day (capped at 1 where it is already opaque)

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

/** How much of the day look to apply for the Time of Day weights w = [day, dusk, night]: full by day, a little at dusk, none at night. Smooth. */
export function dayAmount(w: number[]): number { return clamp01(w[0] + 0.4 * w[1]) }

/** The line colour: the kind's night colour by night, blended toward amber with the day amount (0..1). */
export function routeColor(base: number[], day: number): number[] {
  const d = clamp01(day)
  return [0, 1, 2].map((k) => base[k] + (ROUTE_AMBER[k] - base[k]) * d)
}
export function routeWidthMul(day: number): number { return 1 + (DAY_WIDTH_MUL - 1) * clamp01(day) }
export function routeOpacityMul(day: number): number { return 1 + (DAY_OPACITY_MUL - 1) * clamp01(day) }
