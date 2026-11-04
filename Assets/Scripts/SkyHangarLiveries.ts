// SkyHangarLiveries.ts
// Owns: the colour schemes of the procedural models, as plain data (no Lens globals, runs in Node): twelve-plus generic airliner liveries chosen by a hash of
// the airline string, their own business-jet and turboprop palettes, and the helicopter palettes chosen by a hash of the flight id.
// All colours are invented generic schemes: no real airline logos, names or trademarked marks anywhere on the models.
// Expects: nothing. Must not: touch the scene.

import type {LiveryGeo} from "./SkyHangarModelGeo"

export type RGB = [number, number, number]

export interface PlaneLivery {
  name: string
  body: RGB
  belly: RGB
  tail: RGB
  accent: RGB
  engine: RGB
  winglet: RGB
  rear: RGB
  wing: RGB
  geo: LiveryGeo
}

export interface HeliLook {
  name: string
  body: RGB
  /** Stripe colour along the cabin side, or null (no stripe, the SECONDARY slot just repeats the body colour). */
  stripe: RGB | null
}

/** Stable 32-bit string hash with an avalanche step (FNV-1a + murmur finaliser), so near-identical ids spread evenly. */
export function liveryHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16
  return h >>> 0
}

const W: RGB = [0.93, 0.94, 0.96]
const NAVY: RGB = [0.14, 0.24, 0.58]
const RED: RGB = [0.86, 0.18, 0.2]
const TEAL: RGB = [0.1, 0.6, 0.62]
const ORANGE: RGB = [0.97, 0.5, 0.1]
const GREEN: RGB = [0.16, 0.62, 0.3]
const PURPLE: RGB = [0.52, 0.28, 0.72]
const LILAC: RGB = [0.82, 0.7, 0.95]
const SILVER: RGB = [0.76, 0.79, 0.84]
const SILVER2: RGB = [0.62, 0.66, 0.72]
const SLATE: RGB = [0.3, 0.34, 0.42]
const GOLD: RGB = [0.92, 0.74, 0.26]
const BLACK: RGB = [0.12, 0.12, 0.14]
const YELLOW: RGB = [0.98, 0.82, 0.12]
const GREYBLUE: RGB = [0.56, 0.66, 0.78]
const GREYBLUE2: RGB = [0.42, 0.54, 0.68]
const GREYBLUE_L: RGB = [0.8, 0.85, 0.9]
const SKY: RGB = [0.3, 0.6, 0.9]
const BLUE: RGB = [0.18, 0.4, 0.8]
const CHAMPAGNE: RGB = [0.93, 0.86, 0.72]
const BRONZE: RGB = [0.62, 0.42, 0.22]
const JETSLATE: RGB = [0.56, 0.62, 0.7]
const JETSLATE2: RGB = [0.4, 0.45, 0.54]
const CHARCOAL: RGB = [0.2, 0.21, 0.24]

const g = (cheat: 0 | 1 | 2, tailDeco: LiveryGeo["tailDeco"] = "none", split = false, belly = false, rear = false): LiveryGeo => ({cheat, split, belly, tailDeco, rear, stripe: false})

/** Airliner liveries (narrowbody .. superjumbo, regional). */
export const PLANE_LIVERIES: PlaneLivery[] = [
  {name: "white + navy tail", body: W, belly: W, tail: NAVY, accent: NAVY, engine: W, winglet: NAVY, rear: W, wing: W, geo: g(1)},
  {name: "white + red tail, thick cheatline", body: W, belly: W, tail: RED, accent: RED, engine: W, winglet: RED, rear: W, wing: W, geo: g(2)},
  {name: "white + teal tail", body: W, belly: W, tail: TEAL, accent: TEAL, engine: W, winglet: TEAL, rear: W, wing: W, geo: g(1)},
  {name: "white + orange tail, orange engines", body: W, belly: W, tail: ORANGE, accent: ORANGE, engine: ORANGE, winglet: ORANGE, rear: W, wing: W, geo: g(1)},
  {name: "white + green tail, green rear block", body: W, belly: W, tail: GREEN, accent: GREEN, engine: W, winglet: GREEN, rear: GREEN, wing: W, geo: g(1, "none", false, false, true)},
  {name: "white + purple tail swoosh", body: W, belly: W, tail: PURPLE, accent: LILAC, engine: W, winglet: PURPLE, rear: W, wing: W, geo: g(1, "swoosh")},
  {name: "silver body, dark tail", body: SILVER, belly: SILVER2, tail: SLATE, accent: SLATE, engine: SILVER2, winglet: SLATE, rear: SILVER, wing: SILVER, geo: g(1, "none", true)},
  {name: "dark blue top, white belly", body: NAVY, belly: W, tail: NAVY, accent: W, engine: W, winglet: NAVY, rear: NAVY, wing: [0.85, 0.87, 0.9], geo: g(1, "none", true)},
  {name: "red top, white belly, white tail tip", body: RED, belly: W, tail: RED, accent: W, engine: W, winglet: RED, rear: RED, wing: [0.88, 0.89, 0.92], geo: g(0, "tip", true)},
  {name: "white + black tail, gold cheatline", body: W, belly: W, tail: BLACK, accent: GOLD, engine: W, winglet: GOLD, rear: W, wing: W, geo: g(2)},
  {name: "white + yellow diagonal tail band", body: W, belly: W, tail: W, accent: YELLOW, engine: W, winglet: YELLOW, rear: W, wing: W, geo: g(1, "diag")},
  {name: "grey-blue two-tone, swoosh", body: GREYBLUE, belly: GREYBLUE2, tail: GREYBLUE2, accent: W, engine: GREYBLUE, winglet: W, rear: GREYBLUE2, wing: GREYBLUE_L, geo: g(1, "swoosh", true)},
  {name: "white + sky belly band, blue tail tip", body: W, belly: W, tail: W, accent: SKY, engine: W, winglet: SKY, rear: W, wing: W, geo: g(0, "tip", false, true)}
]

/** Private jets: white / champagne / slate with a thin stripe. */
export const JET_LIVERIES: PlaneLivery[] = [
  {name: "white, navy stripe", body: W, belly: W, tail: W, accent: NAVY, engine: W, winglet: NAVY, rear: W, wing: W, geo: g(1)},
  {name: "champagne, bronze stripe", body: CHAMPAGNE, belly: CHAMPAGNE, tail: CHAMPAGNE, accent: BRONZE, engine: CHAMPAGNE, winglet: BRONZE, rear: CHAMPAGNE, wing: CHAMPAGNE, geo: g(1)},
  {name: "slate, white stripe", body: JETSLATE, belly: JETSLATE, tail: JETSLATE2, accent: W, engine: JETSLATE, winglet: W, rear: JETSLATE, wing: JETSLATE, geo: g(1)},
  {name: "white, slate tail", body: W, belly: W, tail: JETSLATE2, accent: JETSLATE2, engine: W, winglet: JETSLATE2, rear: W, wing: W, geo: g(1)},
  {name: "champagne, white tail, gold stripe", body: CHAMPAGNE, belly: CHAMPAGNE, tail: W, accent: GOLD, engine: CHAMPAGNE, winglet: GOLD, rear: CHAMPAGNE, wing: W, geo: g(1)},
  {name: "white, charcoal tail, red stripe", body: W, belly: W, tail: CHARCOAL, accent: RED, engine: W, winglet: RED, rear: W, wing: W, geo: g(1)}
]

/** Turboprops: white with one bold colour band. */
const bold = (name: string, c: RGB): PlaneLivery => ({name, body: W, belly: W, tail: c, accent: c, engine: W, winglet: c, rear: W, wing: W, geo: g(2, "band", false, true)})
export const PROP_LIVERIES: PlaneLivery[] = [
  bold("white + orange band", ORANGE), bold("white + red band", RED), bold("white + blue band", BLUE),
  bold("white + green band", GREEN), bold("white + teal band", TEAL), bold("white + purple band", PURPLE)
]

/**
 * Helicopter looks: matte, dark, deterministic by hash of the flight id; only one in ten is white. The values are authored in lens colour space, so that
 * the scene's editorTone (which cuts darks and boosts saturation) followed by the luminance floor lands on the matte paint named in each entry.
 */
export const HELI_LOOKS: HeliLook[] = [
  {name: "matte charcoal", body: [0.527, 0.534, 0.547], stripe: null},
  {name: "gunmetal", body: [0.536, 0.569, 0.616], stripe: null},
  {name: "deep navy", body: [0.379, 0.432, 0.612], stripe: null},
  {name: "dark forest green", body: [0.405, 0.538, 0.438], stripe: null},
  {name: "military olive", body: [0.616, 0.629, 0.456], stripe: null},
  {name: "burgundy", body: [0.65, 0.396, 0.45], stripe: null},
  {name: "dark grey, orange rescue stripe", body: [0.553, 0.56, 0.573], stripe: [0.958, 0.658, 0.391]},
  {name: "dark blue, white police-style stripe", body: [0.386, 0.466, 0.666], stripe: [1, 1, 1]}
]
export const HELI_WHITE: HeliLook = {name: "white", body: [1, 1, 1], stripe: null}
/** Dark paint for rotor blades and skids, and the mast / hub metal (same authoring). */
export const HELI_DARK: RGB = [0.475, 0.482, 0.495]
export const HELI_METAL: RGB = [0.721, 0.734, 0.761]

export function heliLookFor(id: string): HeliLook {
  const h = liveryHash(id || "heli")
  if (h % 10 === 0) return HELI_WHITE
  return HELI_LOOKS[(h >>> 4) % HELI_LOOKS.length]
}

/** Livery for an airliner family from the airline string (same airline = same livery); `fallbackId` (the flight id) is used when the airline is empty. */
export function liveryFor(family: string, airline: string, fallbackId: string): PlaneLivery {
  const key = airline && airline.length ? airline : fallbackId || "generic"
  const h = liveryHash(key)
  if (family === "bizSmall" || family === "bizLarge") return JET_LIVERIES[h % JET_LIVERIES.length]
  if (family === "turboprop") return PROP_LIVERIES[h % PROP_LIVERIES.length]
  return PLANE_LIVERIES[h % PLANE_LIVERIES.length]
}

/** Cache key for the decal geometry of a livery. */
export function liveryGeoKey(l: LiveryGeo): string {
  return [l.cheat, l.split ? 1 : 0, l.belly ? 1 : 0, l.tailDeco, l.rear ? 1 : 0, l.stripe ? 1 : 0].join("")
}
