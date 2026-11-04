// SkyHangarModelFactory.ts
// Owns: building the held / hangar / card models from procedural geometry (SkyHangarModelGeo). Seven airliner
// families, four helicopters and four satellites, chosen from the aircraft type code in the data. Each model is ONE
// merged body mesh (rounded lofted fuselage, swept wings, nacelles, window strip, cockpit glass, livery accents,
// top-lit shading baked as palette UVs) plus separate spinning parts (rotors, props) sharing the same material.
// Models face -Z, are centred on their root and sized by `span` (cm, the widest dimension). Returns the spinning
// parts so callers can animate them (spinRotors).
// Colours: NEUTRAL generated per airline (soft white body + one accent from a calm palette, hashed from the airline
// code) — no real liveries, logos or tail marks (trademark rule).
// Expects: a PartKit (its lit material is cloned per palette). Must not: own any interaction or state.

import {SkyKind, SkyObjectInfo} from "./SkyHangarFlightData"
import {PartKit, makeObj} from "./SkyHangarUtil"
import {geoMesh} from "./SkyHangarMeshes"
import {
  AirlinerFamily, HeliFamily, SatFamily, ModelFamily, ModelGeo, SpinAxis, SpinPart, GeoBuilder, buildGeo,
  CELL_PX, GRAD_PX, PALETTE_SLOTS, SLOT, SHADE_BELLY, SHADE_TOP
} from "./SkyHangarModelGeo"

export type {AirlinerFamily, HeliFamily, SatFamily, ModelFamily}

export interface Spinner {
  obj: SceneObject
  axis: vec3
  /** Rate relative to the base rev/s passed to spinRotors (negative = counter-rotating). */
  rate: number
}

export interface BuiltModel {
  root: SceneObject
  /** Pivots that spin about their local Y (main rotor) or X (tail rotor). */
  mainRotor: SceneObject | null
  tailRotor: SceneObject | null
  family: ModelFamily
  /** Every spinning part (main / tail / second rotor, propellers). */
  spinners: Spinner[]
  /** Pivot that turns slowly as a whole (satellites), else null. */
  bodyPivot: SceneObject | null
  /** Triangles drawn for this model and its draw calls (one per mesh, one shared material). */
  tris: number
  drawCalls: number
  /** Faint rotor-blur discs, shown while spinning fast. */
  blurs: SceneObject[]
  material: Material
}

export interface ModelStyle {
  primary: vec4
  secondary: vec4
  lit: boolean
}

// ---------------------------------------------------------------------------------------------------------------
// Type code -> family
// ---------------------------------------------------------------------------------------------------------------

const AIR_LISTS: {[fam: string]: string[]} = {
  narrowbody: ["A318", "A319", "A320", "A321", "A19N", "A20N", "A21N", "A21X", "B731", "B732", "B733", "B734", "B735", "B736", "B737", "B738", "B739", "B37M", "B38M", "B39M", "B3XM", "B752", "B753", "B757", "MD80", "MD81", "MD82", "MD83", "MD87", "MD88", "MD90", "DC91", "DC93", "DC94", "DC95", "T154", "C919", "A220"],
  superjumbo: ["A388", "A380", "A124", "A225"],
  jumbo: ["B741", "B742", "B743", "B744", "B748", "B74S", "B74R"],
  largeWidebody: ["A332", "A333", "A338", "A339", "A342", "A343", "A345", "A346", "B772", "B773", "B77W", "B77L", "B778", "B779", "B77F", "DC10", "MD11", "IL96", "A330"],
  widebody: ["A359", "A35K", "A350", "B787", "B788", "B789", "B78X", "B762", "B763", "B764", "B767", "A310", "A306", "A30B", "IL86"],
  regional: ["E170", "E75L", "E75S", "E190", "E195", "E290", "E295", "E135", "E145", "E45X", "CRJ1", "CRJ2", "CRJ7", "CRJ9", "CRJX", "BCS1", "BCS3", "SU95", "RJ85", "RJ1H", "RJ70", "F70", "F100", "AR85", "B461", "B462", "B463"],
  turboprop: ["AT43", "AT44", "AT45", "AT46", "AT72", "AT73", "AT75", "AT76", "DH8A", "DH8B", "DH8C", "DH8D", "SF34", "JS31", "JS32", "JS41", "B190", "E120", "F50", "F27", "D328", "C208", "PC12", "DHC6", "BE20", "BE9L", "BE99", "SB20", "AN24", "AN26", "AN32", "Q400"],
  bizSmall: ["C25A", "C25B", "C25C", "C25M", "C510", "C525", "C550", "C560", "E50P", "E55P", "PRM1", "HDJT", "LJ35", "LJ45", "LJ60", "LJ75", "FA50", "H25B", "H25C", "BE40", "ASTR"],
  bizLarge: ["C56X", "C680", "C68A", "C700", "C750", "GLF2", "GLF3", "GLF4", "GLF5", "GLF6", "GL5T", "GL6T", "GL7T", "GALX", "G280", "FA7X", "FA8X", "F900", "F2TH", "CL30", "CL35", "CL60"]
}

const HELI_LISTS: {[fam: string]: string[]} = {
  lightPiston: ["R22", "R44", "H269", "S300", "EN28", "EN48", "B47G", "B47J"],
  lightTurbine: ["R66", "B06", "B06T", "B206", "B407", "B505", "EC20", "AS50", "AS55", "H500", "MD52", "MD60", "EXPL", "H125", "H120", "EC30", "H130"],
  mediumTwin: ["EC35", "EC45", "EC55", "H135", "H145", "A109", "A119", "A139", "A169", "AS65", "B412", "B212", "B222", "B230", "B427", "B429", "S76", "H160", "H60", "S70", "UH60", "BK17"],
  largeTransport: ["H53", "S61", "S64", "S65", "S92", "MI8", "MI17", "MI24", "MI26", "NH90", "EH10", "KA32", "AS32", "AS33", "EC25", "H215", "H225"],
  tandem: ["CH47", "H47", "B234", "V107", "H46"]
}

const SAT_LISTS: {[fam: string]: string[]} = {
  station: ["ISS", "CSS", "ZARYA", "TIANHE", "TIANGONG", "MIR"],
  flatpanel: ["NOAA 15", "NOAA 18", "NOAA 19", "STARLINK", "ONEWEB", "IRIDIUM", "GLOBALSTAR", "ORBCOMM", "KUIPER"],
  cubesat: ["CUBESAT", "FLOCK", "LEMUR", "DOVE", "PLANET", "SKYSAT", "CSAT"],
  comms: ["HST", "HUBBLE", "GPS", "GOES", "INTELSAT", "TDRS", "ASTRA", "EUTELSAT", "SES", "ISS-COMMS"]
}

function lookup(lists: {[fam: string]: string[]}, t: string): string | null {
  for (const fam in lists) if (lists[fam].indexOf(t) >= 0) return fam
  return null
}

/** Stable 32-bit string hash with an avalanche step (FNV-1a + murmur finaliser), so near-identical ids spread evenly. */
function mixHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16
  return h >>> 0
}

/** Deterministic weighted pick: the same key always lands on the same entry. */
function weightedPick<T>(key: string, table: [T, number][]): T {
  let total = 0
  for (const e of table) total += e[1]
  let r = (mixHash(key) % 100000) / 100000 * total
  for (const e of table) {
    if (r < e[1]) return e[0]
    r -= e[1]
  }
  return table[table.length - 1][0]
}

// Realistic fleet mix, used only when the type code is unknown or missing.
const AIR_WEIGHTS: [AirlinerFamily, number][] = [
  ["narrowbody", 50], ["widebody", 18], ["largeWidebody", 8], ["jumbo", 7], ["regional", 7], ["turboprop", 4], ["bizSmall", 3], ["bizLarge", 3]
]
const PRIVATE_AIR_WEIGHTS: [AirlinerFamily, number][] = [["bizSmall", 55], ["bizLarge", 45]]
const HELI_WEIGHTS: [HeliFamily, number][] = [["lightPiston", 24], ["lightTurbine", 30], ["mediumTwin", 26], ["largeTransport", 14], ["tandem", 6]]
const LOCAL_HELI_WEIGHTS: [HeliFamily, number][] = [["lightPiston", 45], ["lightTurbine", 55]]
const SAT_WEIGHTS: [SatFamily, number][] = [["flatpanel", 34], ["cubesat", 28], ["comms", 28], ["station", 10]]

/** Where a family choice came from, for the tests: "code" = type-code table, "hash" = deterministic fallback. */
export interface FamilyPick {family: ModelFamily; via: "code" | "hash"}

function airlinerByCode(t: string): AirlinerFamily | null {
  const hit = lookup(AIR_LISTS, t)
  if (hit) return hit as AirlinerFamily
  if (/^(C5\d|LJ\d|E5[05]P|PRM|HDJT|H25|BE4)/.test(t)) return "bizSmall"
  if (/^(C6\d|C7\d|GL\w\w|FA[78]|F9|F2|CL[36]|ASTR|GALX|G\d\d\d)/.test(t)) return "bizLarge"
  if (/^(AT\d|DH8|SF3|B19|JS\d|F50|F27|D32|C208|PC12|DHC|BE\d|SB20|AN2|Q4)/.test(t)) return "turboprop"
  if (/^(E1|E7|E9|E2|CRJ|SU9|RJ|BCS)/.test(t)) return "regional"
  if (/^(A31[89]|A32|A2[01]N|B73|B3[789]M|B75|MD[89])/.test(t)) return "narrowbody"
  return null
}

/**
 * Family for an aircraft. The ICAO type code wins; unknown or missing codes fall back to a weighted choice hashed from
 * the flight id (stable per flight). `local` = private / local operator (no airline code): those fall back to business jets
 * (planes) or light helicopters, never an airliner.
 */
export function pickFamily(kind: SkyKind, typeCode: string | undefined, id?: string, local?: boolean): FamilyPick {
  const t = (typeCode ?? "").toUpperCase().trim()
  const key = (id && id.length ? id : t.length ? t : "generic") + "#" + kind
  if (kind === "helicopter") {
    const hit = lookup(HELI_LISTS, t) as HeliFamily | null
    return hit ? {family: hit, via: "code"} : {family: weightedPick(key, local ? LOCAL_HELI_WEIGHTS : HELI_WEIGHTS), via: "hash"}
  }
  if (kind === "satellite") {
    let hit = lookup(SAT_LISTS, t) as SatFamily | null
    if (!hit && (t.indexOf("NOAA") === 0 || t.indexOf("STARLINK") === 0)) hit = "flatpanel"
    return hit ? {family: hit, via: "code"} : {family: weightedPick(key, SAT_WEIGHTS), via: "hash"}
  }
  const hit = airlinerByCode(t)
  return hit ? {family: hit, via: "code"} : {family: weightedPick(key, local ? PRIVATE_AIR_WEIGHTS : AIR_WEIGHTS), via: "hash"}
}

export function familyFor(typeCode: string | undefined, id?: string, local?: boolean): AirlinerFamily {
  return pickFamily("plane", typeCode, id, local).family as AirlinerFamily
}

export function heliFamilyFor(typeCode: string | undefined, id?: string, local?: boolean): HeliFamily {
  return pickFamily("helicopter", typeCode, id, local).family as HeliFamily
}

export function satFamilyFor(typeCode: string | undefined, id?: string): SatFamily {
  return pickFamily("satellite", typeCode, id).family as SatFamily
}

export function modelFamilyFor(kind: SkyKind, typeCode: string | undefined, id?: string, local?: boolean): ModelFamily {
  return pickFamily(kind, typeCode, id, local).family
}

/** Convenience for data objects: id + "no airline code means private / local". */
export function familyForInfo(info: {kind: SkyKind; aircraftType: string; id: string; airlineIcao: string}): ModelFamily {
  return modelFamilyFor(info.kind, info.aircraftType, info.id, info.kind !== "satellite" && !info.airlineIcao)
}

// ---------------------------------------------------------------------------------------------------------------
// Style and palette material
// ---------------------------------------------------------------------------------------------------------------

// Calm accent palette for neutral generated colours (no airline liveries).
const ACCENTS: vec4[] = [
  new vec4(0.45, 0.68, 0.95, 1), // sky blue
  new vec4(0.38, 0.78, 0.78, 1), // teal
  new vec4(0.62, 0.78, 0.6, 1), // sage
  new vec4(0.86, 0.76, 0.56, 1), // sand
  new vec4(0.7, 0.64, 0.9, 1), // lavender
  new vec4(0.9, 0.62, 0.6, 1), // soft coral
  new vec4(0.56, 0.64, 0.76, 1) // slate
]
const BODY_WHITE = new vec4(0.92, 0.93, 0.95, 1)

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return Math.abs(h)
}

/**
 * Neutral generated style. `colors` (recorded data) is ignored on purpose for aircraft: real livery
 * colours are not used. Helicopters get a warm amber accent, satellites silver + cyan panels.
 */
export function styleFor(_colors: string[], kind: SkyKind, lit: boolean, airlineKey?: string): ModelStyle {
  if (kind === "helicopter") return {primary: new vec4(0.93, 0.92, 0.9, 1), secondary: new vec4(1.0, 0.72, 0.32, 1), lit}
  if (kind === "satellite") return {primary: new vec4(0.86, 0.88, 0.92, 1), secondary: new vec4(0.3, 0.72, 0.95, 1), lit}
  const accent = ACCENTS[hash(airlineKey && airlineKey.length ? airlineKey : "generic") % ACCENTS.length]
  return {primary: BODY_WHITE, secondary: accent, lit}
}

/** Palette colours by slot, in SLOT order. Nothing is dark: the display is additive. */
function paletteColors(s: ModelStyle): vec4[] {
  const c = new Array<vec4>(PALETTE_SLOTS)
  c[SLOT.PRIMARY] = s.primary
  c[SLOT.SECONDARY] = s.secondary
  c[SLOT.GLASS] = new vec4(0.17, 0.21, 0.27, 1) // dark grey-blue (not navy)
  c[SLOT.METAL] = new vec4(0.72, 0.75, 0.8, 1)
  c[SLOT.DARK] = new vec4(0.36, 0.4, 0.48, 1)
  c[SLOT.FOIL] = new vec4(0.95, 0.8, 0.42, 1)
  c[SLOT.WHITE] = new vec4(0.96, 0.96, 0.97, 1)
  c[SLOT.CELL] = new vec4(s.secondary.x * 0.82, s.secondary.y * 0.82, s.secondary.z * 0.9, 1)
  c[SLOT.CLEAR] = new vec4(0.5, 0.64, 0.8, 1)
  c[SLOT.GRID] = new vec4(0.2, 0.23, 0.3, 1)
  return c
}

const materialCache: {[key: string]: Material} = {}

/**
 * The shared model material for a style: the kit's lit PBR material with a small palette texture (one cell per
 * colour slot, each cell a belly-dark .. top-light gradient). One material serves every model of that style.
 */
export function modelMaterial(kit: PartKit, style: ModelStyle): Material {
  const cols = paletteColors(style)
  const key = cols.map((c) => c.x.toFixed(2) + c.y.toFixed(2) + c.z.toFixed(2)).join("|")
  const hit = materialCache[key]
  if (hit && !isNull(hit)) return hit
  const w = PALETTE_SLOTS * CELL_PX, h = GRAD_PX
  const data = new Uint8Array(w * h * 4)
  for (let r = 0; r < h; r++) {
    const f = SHADE_BELLY + (SHADE_TOP - SHADE_BELLY) * (r / (h - 1))
    for (let sIdx = 0; sIdx < PALETTE_SLOTS; sIdx++) {
      for (let x = 0; x < CELL_PX; x++) {
        const o = (r * w + sIdx * CELL_PX + x) * 4
        data[o] = Math.round(Math.min(1, cols[sIdx].x * f) * 255)
        data[o + 1] = Math.round(Math.min(1, cols[sIdx].y * f) * 255)
        data[o + 2] = Math.round(Math.min(1, cols[sIdx].z * f) * 255)
        data[o + 3] = 255
      }
    }
  }
  const tex = ProceduralTextureProvider.createWithFormat(w, h, TextureFormat.RGBA8Unorm)
  ;(tex.control as ProceduralTextureProvider).setPixels(0, 0, w, h, data)
  const m = kit.litMat.clone()
  m.mainPass.baseTex = tex
  m.mainPass.baseColor = new vec4(1, 1, 1, 1)
  m.mainPass.blendMode = BlendMode.Disabled
  m.mainPass.depthWrite = true
  m.mainPass.depthTest = true
  m.mainPass.twoSided = false
  m.mainPass.roughness = 0.6
  m.mainPass.metallic = 0
  materialCache[key] = m
  return m
}

// ---------------------------------------------------------------------------------------------------------------
// Fleet examples: one real-type example per family, so the Hangar can show the whole fleet
// ---------------------------------------------------------------------------------------------------------------

/** One example per family: a real ICAO type of that family and its real name. Labelled as an example model, never as a flight. */
const FLEET: {kind: SkyKind; type: string; name: string}[] = [
  {kind: "plane", type: "A320", name: "Airbus A320"},
  {kind: "plane", type: "B788", name: "Boeing 787-8"},
  {kind: "plane", type: "B77W", name: "Boeing 777-300ER"},
  {kind: "plane", type: "B744", name: "Boeing 747-400"},
  {kind: "plane", type: "A388", name: "Airbus A380-800"},
  {kind: "plane", type: "E190", name: "Embraer 190"},
  {kind: "plane", type: "AT72", name: "ATR 72"},
  {kind: "plane", type: "C25B", name: "Cessna Citation CJ3"},
  {kind: "plane", type: "GLF6", name: "Gulfstream G650"},
  {kind: "helicopter", type: "R44", name: "Robinson R44"},
  {kind: "helicopter", type: "B06", name: "Bell 206 JetRanger"},
  {kind: "helicopter", type: "EC35", name: "Airbus H135"},
  {kind: "helicopter", type: "S92", name: "Sikorsky S-92"},
  {kind: "helicopter", type: "CH47", name: "Boeing CH-47 Chinook"},
  {kind: "satellite", type: "CUBESAT", name: "CubeSat"},
  {kind: "satellite", type: "HST", name: "Space telescope"},
  {kind: "satellite", type: "NOAA 19", name: "Polar weather satellite"},
  {kind: "satellite", type: "ISS", name: "Space station"}
]

/** Example models for every family not in `have` (family of an entry already on the shelf). No airline, route or registration is invented. */
export function fleetExamples(have: {[family: string]: boolean}): SkyObjectInfo[] {
  const out: SkyObjectInfo[] = []
  for (const f of FLEET) {
    const fam = modelFamilyFor(f.kind, f.type, "EX_" + f.type)
    if (have[fam]) continue
    have[fam] = true
    out.push({
      id: "EX_" + f.type.replace(/\W/g, ""), kind: f.kind, callsign: f.type, flight: "Example model", airline: "Example model", airlineIcao: "",
      origin: "", originCity: "", destination: "", destinationCity: "", departUtc: "", arriveUtc: "", aircraftType: f.type, aircraftTypeName: f.name,
      registration: "", altitudeFt: 0, speedKt: 0, trackDeg: 0, lat: 0, lon: 0, distanceKm: 0, azimuthDeg: 0, realElevationDeg: 0, skyElevationDeg: 0,
      skyAzimuthDeg: 0, departedAgoMin: 0, arrivingInMin: 0, skyPathPast: [], skyPathAhead: [], bearingToOriginDeg: 0, bearingToDestDeg: 0, colors: []
    })
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------------------------------------------

const geoCache: {[fam: string]: ModelGeo} = {}
function geoFor(fam: ModelFamily): ModelGeo {
  if (!geoCache[fam]) geoCache[fam] = buildGeo(fam)
  return geoCache[fam]
}

const AXES: {[a in SpinAxis]: vec3} = {y: new vec3(0, 1, 0), x: new vec3(1, 0, 0), z: new vec3(0, 0, 1)}

function addMesh(parent: SceneObject, name: string, mesh: RenderMesh, mat: Material, span: number): SceneObject {
  const o = makeObj(parent, name)
  o.getTransform().setLocalScale(new vec3(span, span, span))
  const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
  rmv.mesh = mesh
  rmv.mainMaterial = mat
  return o
}

export function buildModel(kit: PartKit, parent: SceneObject, name: string, kind: SkyKind, span: number, style: ModelStyle, typeCode?: string, id?: string, local?: boolean): BuiltModel {
  const family = modelFamilyFor(kind, typeCode, id, local)
  const geo = geoFor(family)
  const mat = modelMaterial(kit, style)
  const root = makeObj(parent, name)
  const model: BuiltModel = {root, mainRotor: null, tailRotor: null, family, spinners: [], bodyPivot: null, blurs: [], tris: 0, drawCalls: 0, material: mat}

  let bodyParent = root
  if (geo.bodySpin) {
    model.bodyPivot = makeObj(root, "SpinPivot")
    bodyParent = model.bodyPivot
  }
  addMesh(bodyParent, "Body", geoMesh(family + ":body", geo.body), mat, span)
  model.tris += geo.body.tris
  model.drawCalls++

  for (const sp of geo.spins as SpinPart[]) {
    const pivot = makeObj(root, sp.role === "main" ? "MainRotor" : sp.role === "tail" ? "TailRotor" : sp.name)
    pivot.getTransform().setLocalPosition(new vec3(sp.pivot[0] * span, sp.pivot[1] * span, sp.pivot[2] * span))
    addMesh(pivot, sp.name + "_Mesh", geoMesh(family + ":" + sp.name, sp.geo), mat, span)
    model.spinners.push({obj: pivot, axis: AXES[sp.axis], rate: sp.rate})
    if (sp.role === "main") model.mainRotor = pivot
    else if (sp.role === "tail") model.tailRotor = pivot
    model.tris += sp.geo.tris
    model.drawCalls++
    if (sp.blurR) {
      const bo = makeObj(pivot, "Blur")
      const rmv = bo.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
      rmv.mesh = blurMesh(sp.axis === "x" ? "x" : "y")
      rmv.mainMaterial = blurMaterial(kit)
      bo.getTransform().setLocalScale(new vec3(sp.blurR * span, sp.blurR * span, sp.blurR * span))
      bo.enabled = false
      model.blurs.push(bo)
      model.drawCalls++
    }
  }
  return model
}

let blurMat: Material | null = null
function blurMaterial(kit: PartKit): Material {
  if (!blurMat || isNull(blurMat)) {
    blurMat = kit.uniqueUnlit(new vec4(0.92, 0.96, 1.0, 0.14))
    blurMat.mainPass.depthWrite = false
    blurMat.mainPass.twoSided = true
  }
  return blurMat
}

/** Unit disc facing +Y (or +X for tail rotors). */
function blurMesh(axis: "x" | "y"): RenderMesh {
  const g = new GeoBuilder()
  g.disc([0, 0, 0], axis === "y" ? [0, 1, 0] : [1, 0, 0], 1, SLOT.WHITE, 28)
  return geoMesh("blur:" + axis, g)
}

/** Spin helper: call each frame with dt and a speed in rev/s. Rotors / props turn; satellites turn slowly as a whole. */
export function spinRotors(m: BuiltModel, dt: number, revPerSec: number): void {
  for (const s of m.spinners) {
    if (isNull(s.obj)) continue
    const t = s.obj.getTransform()
    t.setLocalRotation(t.getLocalRotation().multiply(quat.angleAxis(revPerSec * s.rate * dt * Math.PI * 2, s.axis)))
  }
  const fast = revPerSec >= 3
  for (const b of m.blurs) if (!isNull(b) && b.enabled !== fast) b.enabled = fast
  if (m.bodyPivot && !isNull(m.bodyPivot)) {
    const t = m.bodyPivot.getTransform()
    t.setLocalRotation(t.getLocalRotation().multiply(quat.angleAxis(revPerSec * 0.08 * dt * Math.PI * 2, AXES.y)))
  }
}
