// SkyHangarModelFactory.ts
// Owns: code-authored stylized geometry for the held / hangar / card models — three airliner families
// (narrowbody, widebody, regional, chosen from the aircraft type code), a helicopter with spinning rotors
// and a satellite with a body and solar panels. Smooth lathed fuselages, swept wings, engines, tail,
// a window line and a soft rim highlight (inverted-hull glow). Models face -Z, are centred on their root
// and sized by `span` (cm, the widest dimension). Returns rotor pivots so callers can spin them.
// Colours: NEUTRAL generated per airline (soft white body + one accent from a calm palette, hashed from
// the airline code) — no real liveries, logos or tail marks (trademark rule).
// Expects: a PartKit. Must not: own any interaction or state.

import {SkyKind} from "./SkyHangarFlightData"
import {PartKit, makeObj} from "./SkyHangarUtil"
import {latheMesh, wingMesh, fuselageRings, teardropRings, nacelleRings, dishRings} from "./SkyHangarMeshes"

export interface BuiltModel {
  root: SceneObject
  /** Pivots that spin about their local Y (main rotor) or X (tail rotor). */
  mainRotor: SceneObject | null
  tailRotor: SceneObject | null
}

export interface ModelStyle {
  primary: vec4
  secondary: vec4
  lit: boolean
}

export type AirlinerFamily = "narrowbody" | "widebody" | "regional"

const WIDEBODY = ["A35K", "A359", "A332", "A333", "A339", "A338", "B77W", "B772", "B773", "B788", "B789", "B78X", "B744", "B748", "A388", "B763"]
const REGIONAL = ["BCS1", "BCS3", "E170", "E175", "E190", "E195", "E290", "E295", "E55P", "CRJ7", "CRJ9", "AT72", "AT76", "DH8D", "C25B"]

export function familyFor(typeCode: string | undefined): AirlinerFamily {
  const t = (typeCode ?? "").toUpperCase()
  if (WIDEBODY.indexOf(t) >= 0) return "widebody"
  if (REGIONAL.indexOf(t) >= 0) return "regional"
  return "narrowbody"
}

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

const RX90 = quat.angleAxis(Math.PI / 2, vec3.right())
const RZ90 = quat.angleAxis(Math.PI / 2, vec3.forward())

let rimMat: Material | null = null
/** Soft rim highlight: an inverted hull (front faces culled) in a faint cool white. */
function rimMaterial(kit: PartKit): Material {
  if (!rimMat) {
    rimMat = kit.uniqueUnlit(new vec4(0.75, 0.88, 1.0, 0.28))
    rimMat.mainPass.cullMode = CullMode.Front
    rimMat.mainPass.twoSided = false
  }
  return rimMat
}

export function buildModel(kit: PartKit, parent: SceneObject, name: string, kind: SkyKind, span: number, style: ModelStyle, typeCode?: string): BuiltModel {
  if (kind === "helicopter") return buildHelicopter(kit, parent, name, span, style)
  if (kind === "satellite") return buildSatellite(kit, parent, name, span, style)
  return buildAirliner(kit, parent, name, span, style, familyFor(typeCode))
}

function buildAirliner(kit: PartKit, parent: SceneObject, name: string, span: number, s: ModelStyle, fam: AirlinerFamily): BuiltModel {
  const root = makeObj(parent, name)
  const body = kit.mat(s.primary, s.lit)
  const accent = kit.mat(s.secondary, s.lit)
  const windowMat = kit.mat(new vec4(0.55, 0.68, 0.85, 1), s.lit)
  const L = span // wingspan
  const P = {
    narrowbody: {len: 1.0, d: 0.105, wingX: 0.0, wingRoot: 0.24, wingTip: 0.07, sweep: 0.2, engines: 2, eng: 0.065, tTail: false, rearEngines: false},
    widebody: {len: 1.0, d: 0.13, wingX: 0.0, wingRoot: 0.26, wingTip: 0.06, sweep: 0.26, engines: 2, eng: 0.09, tTail: false, rearEngines: false},
    regional: {len: 0.92, d: 0.095, wingX: 0.06, wingRoot: 0.22, wingTip: 0.08, sweep: 0.14, engines: 2, eng: 0.055, tTail: true, rearEngines: true}
  }[fam]
  const len = L * P.len
  const D = L * P.d
  const fus = latheMesh("fus_" + fam, fuselageRings(0.13, 0.28, fam === "widebody" ? 0.12 : 0.15), 20)
  kit.part(root, "Fuselage", fus, body, new vec3(0, 0, 0), new vec3(D, D * 1.05, len))
  kit.part(root, "RimHighlight", fus, rimMaterial(kit), new vec3(0, 0, 0), new vec3(D * 1.1, D * 1.15, len * 1.02))
  // Window line on both sides (pale blue strip — light, never dark, on an additive display)
  kit.part(root, "WindowLineL", kit.box, windowMat, new vec3(-D * 0.49, D * 0.13, -len * 0.06), new vec3(D * 0.03, D * 0.1, len * 0.62))
  kit.part(root, "WindowLineR", kit.box, windowMat, new vec3(D * 0.49, D * 0.13, -len * 0.06), new vec3(D * 0.03, D * 0.1, len * 0.62))
  kit.part(root, "Cockpit", kit.box, windowMat, new vec3(0, D * 0.2, -len * 0.455), new vec3(D * 0.5, D * 0.12, D * 0.22), quat.angleAxis(-0.5, vec3.right()))
  // Swept wings (low wing)
  const wz = -len * 0.02 + len * P.wingX
  const wingL = wingMesh("w_" + fam + "_l", P.wingRoot, P.wingTip, P.sweep, 0.03, true)
  const wingR = wingMesh("w_" + fam + "_r", P.wingRoot, P.wingTip, P.sweep, 0.03, false)
  kit.part(root, "WingL", wingL, body, new vec3(-L * 0.25, -D * 0.28, wz + L * P.sweep * 0.25), new vec3(L * 0.5, L * 0.02, L * (P.sweep + P.wingRoot)))
  kit.part(root, "WingR", wingR, body, new vec3(L * 0.25, -D * 0.28, wz + L * P.sweep * 0.25), new vec3(L * 0.5, L * 0.02, L * (P.sweep + P.wingRoot)))
  kit.part(root, "WingTipL", kit.box, accent, new vec3(-L * 0.5, -D * 0.1, wz + L * P.sweep * 0.9), new vec3(L * 0.012, L * 0.045, L * 0.05))
  kit.part(root, "WingTipR", kit.box, accent, new vec3(L * 0.5, -D * 0.1, wz + L * P.sweep * 0.9), new vec3(L * 0.012, L * 0.045, L * 0.05))
  // Engines
  const nac = latheMesh("nacelle", nacelleRings(), 14)
  const ed = L * P.eng
  if (P.rearEngines) {
    kit.part(root, "EngineL", nac, accent, new vec3(-D * 0.85, D * 0.2, len * 0.3), new vec3(ed, ed, ed * 2.6))
    kit.part(root, "EngineR", nac, accent, new vec3(D * 0.85, D * 0.2, len * 0.3), new vec3(ed, ed, ed * 2.6))
  } else {
    const ex = L * (fam === "widebody" ? 0.18 : 0.17)
    kit.part(root, "EngineL", nac, accent, new vec3(-ex, -D * 0.8, wz - L * 0.02), new vec3(ed, ed, ed * 2.3))
    kit.part(root, "EngineR", nac, accent, new vec3(ex, -D * 0.8, wz - L * 0.02), new vec3(ed, ed, ed * 2.3))
  }
  // Tail: vertical fin (accent, no marks) + stabilisers (low, or T-tail for regional)
  const finMesh = wingMesh("fin_" + fam, 0.9, 0.42, 0.55, 0.12, false)
  const finH = L * (fam === "widebody" ? 0.2 : 0.18)
  kit.part(root, "TailFin", finMesh, accent, new vec3(0, D * 0.45 + finH / 2, len * 0.42), new vec3(finH, L * 0.012, L * 0.16), RZ90)
  const stabL = wingMesh("stab_" + fam + "_l", 0.7, 0.35, 0.35, 0.05, true)
  const stabR = wingMesh("stab_" + fam + "_r", 0.7, 0.35, 0.35, 0.05, false)
  const sy = P.tTail ? D * 0.45 + finH * 0.95 : D * 0.15
  const sz = P.tTail ? len * 0.47 : len * 0.44
  kit.part(root, "StabL", stabL, body, new vec3(-L * 0.08, sy, sz), new vec3(L * 0.16, L * 0.01, L * 0.08))
  kit.part(root, "StabR", stabR, body, new vec3(L * 0.08, sy, sz), new vec3(L * 0.16, L * 0.01, L * 0.08))
  // Accent belly stripe (neutral, generic)
  kit.part(root, "Cheatline", kit.box, accent, new vec3(0, -D * 0.2, -len * 0.04), new vec3(D * 1.02, D * 0.07, len * 0.66))
  return {root, mainRotor: null, tailRotor: null}
}

function buildHelicopter(kit: PartKit, parent: SceneObject, name: string, span: number, s: ModelStyle): BuiltModel {
  const root = makeObj(parent, name)
  const L = span // rotor diameter
  const body = kit.mat(s.primary, s.lit)
  const accent = kit.mat(s.secondary, s.lit)
  const glass = kit.mat(new vec4(0.6, 0.82, 1.0, 1), s.lit)
  const metal = kit.mat(new vec4(0.72, 0.75, 0.8, 1), s.lit)
  const cabin = latheMesh("heli_cabin", teardropRings(), 18)
  kit.part(root, "Cabin", cabin, accent, new vec3(0, 0, -L * 0.05), new vec3(L * 0.26, L * 0.26, L * 0.46))
  kit.part(root, "RimHighlight", cabin, rimMaterial(kit), new vec3(0, 0, -L * 0.05), new vec3(L * 0.285, L * 0.285, L * 0.49))
  kit.part(root, "Canopy", kit.sphere, glass, new vec3(0, L * 0.035, -L * 0.17), new vec3(L * 0.2, L * 0.15, L * 0.17))
  kit.part(root, "BellyStripe", kit.box, body, new vec3(0, -L * 0.04, -L * 0.03), new vec3(L * 0.262, L * 0.03, L * 0.3))
  const boom = latheMesh("heli_boom", [[-0.5, 0.5, 0], [0, 0.42, 0], [0.5, 0.28, 0]], 12)
  kit.part(root, "TailBoom", boom, accent, new vec3(0, L * 0.05, L * 0.34), new vec3(L * 0.07, L * 0.07, L * 0.42))
  const fin = wingMesh("heli_fin", 0.9, 0.5, 0.4, 0.12, false)
  kit.part(root, "TailFin", fin, accent, new vec3(0, L * 0.12, L * 0.54), new vec3(L * 0.14, L * 0.01, L * 0.09), RZ90)
  kit.part(root, "SkidL", kit.cylinder, metal, new vec3(-L * 0.12, -L * 0.16, -L * 0.04), new vec3(L * 0.018, L * 0.42, L * 0.018), RX90)
  kit.part(root, "SkidR", kit.cylinder, metal, new vec3(L * 0.12, -L * 0.16, -L * 0.04), new vec3(L * 0.018, L * 0.42, L * 0.018), RX90)
  kit.part(root, "StrutLF", kit.box, metal, new vec3(-L * 0.1, -L * 0.11, -L * 0.13), new vec3(L * 0.012, L * 0.1, L * 0.012), quat.angleAxis(-0.4, vec3.forward()))
  kit.part(root, "StrutRF", kit.box, metal, new vec3(L * 0.1, -L * 0.11, -L * 0.13), new vec3(L * 0.012, L * 0.1, L * 0.012), quat.angleAxis(0.4, vec3.forward()))
  kit.part(root, "StrutLB", kit.box, metal, new vec3(-L * 0.1, -L * 0.11, L * 0.06), new vec3(L * 0.012, L * 0.1, L * 0.012), quat.angleAxis(-0.4, vec3.forward()))
  kit.part(root, "StrutRB", kit.box, metal, new vec3(L * 0.1, -L * 0.11, L * 0.06), new vec3(L * 0.012, L * 0.1, L * 0.012), quat.angleAxis(0.4, vec3.forward()))
  kit.part(root, "Mast", kit.cylinder, metal, new vec3(0, L * 0.15, -L * 0.04), new vec3(L * 0.028, L * 0.06, L * 0.028))
  const main = makeObj(root, "MainRotor")
  main.getTransform().setLocalPosition(new vec3(0, L * 0.185, -L * 0.04))
  kit.part(main, "BladeA", kit.box, metal, vec3.zero(), new vec3(L, L * 0.008, L * 0.045))
  kit.part(main, "BladeB", kit.box, metal, vec3.zero(), new vec3(L * 0.045, L * 0.008, L))
  kit.part(main, "Hub", kit.sphere, accent, vec3.zero(), new vec3(L * 0.05, L * 0.03, L * 0.05))
  const tail = makeObj(root, "TailRotor")
  tail.getTransform().setLocalPosition(new vec3(L * 0.035, L * 0.1, L * 0.55))
  kit.part(tail, "TailBladeA", kit.box, metal, vec3.zero(), new vec3(L * 0.008, L * 0.17, L * 0.022))
  kit.part(tail, "TailBladeB", kit.box, metal, vec3.zero(), new vec3(L * 0.008, L * 0.022, L * 0.17))
  return {root, mainRotor: main, tailRotor: tail}
}

function buildSatellite(kit: PartKit, parent: SceneObject, name: string, span: number, s: ModelStyle): BuiltModel {
  const root = makeObj(parent, name)
  const L = span // panel tip to tip
  const bus = kit.mat(s.primary, s.lit)
  const panel = kit.mat(s.secondary, s.lit)
  const frame = kit.mat(new vec4(0.85, 0.88, 0.92, 1), s.lit)
  const foil = kit.mat(new vec4(0.95, 0.82, 0.48, 1), s.lit)
  const white = kit.mat(new vec4(0.96, 0.96, 0.97, 1), s.lit)
  const busMesh = latheMesh("sat_bus", [[-0.5, 0.42, 0], [-0.46, 0.5, 0], [0.46, 0.5, 0], [0.5, 0.42, 0]], 16)
  kit.part(root, "Bus", busMesh, bus, vec3.zero(), new vec3(L * 0.18, L * 0.18, L * 0.3))
  kit.part(root, "RimHighlight", busMesh, rimMaterial(kit), vec3.zero(), new vec3(L * 0.2, L * 0.2, L * 0.32))
  kit.part(root, "FoilBand", busMesh, foil, new vec3(0, 0, L * 0.03), new vec3(L * 0.185, L * 0.185, L * 0.08))
  kit.part(root, "Boom", kit.cylinder, frame, vec3.zero(), new vec3(L * 0.015, L * 0.94, L * 0.015), RZ90)
  for (const side of [-1, 1]) {
    const nm = side < 0 ? "PanelL" : "PanelR"
    const holder = makeObj(root, nm)
    holder.getTransform().setLocalPosition(new vec3(side * L * 0.31, 0, 0))
    kit.part(holder, nm + "_Frame", kit.box, frame, vec3.zero(), new vec3(L * 0.34, L * 0.008, L * 0.2))
    for (let c = 0; c < 3; c++) {
      const x = (c - 1) * L * 0.108
      kit.part(holder, nm + "_Cell" + c, kit.box, panel, new vec3(x, L * 0.005, 0), new vec3(L * 0.1, L * 0.008, L * 0.18))
    }
  }
  const dish = latheMesh("sat_dish", dishRings(), 16)
  kit.part(root, "Dish", dish, white, new vec3(0, L * 0.14, -L * 0.06), new vec3(L * 0.15, L * 0.15, L * 0.05), RX90)
  kit.part(root, "DishFeed", kit.cylinder, frame, new vec3(0, L * 0.19, -L * 0.06), new vec3(L * 0.008, L * 0.06, L * 0.008))
  kit.part(root, "Antenna", kit.cylinder, frame, new vec3(0, -L * 0.15, L * 0.1), new vec3(L * 0.008, L * 0.12, L * 0.008))
  return {root, mainRotor: null, tailRotor: null}
}

/** Spin helper: call each frame with dt and a speed in rev/s. */
export function spinRotors(m: BuiltModel, dt: number, revPerSec: number): void {
  if (m.mainRotor && !isNull(m.mainRotor)) {
    const t = m.mainRotor.getTransform()
    t.setLocalRotation(t.getLocalRotation().multiply(quat.angleAxis(revPerSec * dt * Math.PI * 2, vec3.up())))
  }
  if (m.tailRotor && !isNull(m.tailRotor)) {
    const t = m.tailRotor.getTransform()
    t.setLocalRotation(t.getLocalRotation().multiply(quat.angleAxis(revPerSec * 1.6 * dt * Math.PI * 2, vec3.right())))
  }
}
