// SkyHangarGlyphs.ts
// Owns: flat, camera-facing marker glyphs for the sky (and later the radar): a plane silhouette with
// its nose on local +Y (wings and tailplane swept BACK, tips toward -Y), a helicopter with a rotor cross, and a satellite dot with a faint ring.
// Glyphs lie in the local XY plane facing +Z, sized by `span` (cm, the widest dimension).
// Expects: a PartKit. Must not: hold interaction or state.

import {SkyKind} from "./SkyHangarFlightData"
import {PartKit, makeObj} from "./SkyHangarUtil"

export interface BuiltGlyph {
  root: SceneObject
  /** Materials to brighten/dim together (alpha is driven by the caller). */
  materials: Material[]
  baseAlpha: number[]
  /** Rotor cross pivot (helicopters) — spins about local Z. */
  rotor: SceneObject | null
}

export function buildGlyph(kit: PartKit, parent: SceneObject, name: string, kind: SkyKind, span: number, color: vec4): BuiltGlyph {
  const root = makeObj(parent, name)
  const S = span
  const t = S * 0.03 // glyph thickness
  const main = kit.uniqueUnlit(new vec4(color.x, color.y, color.z, 0.85))
  const mats: Material[] = [main]
  const base: number[] = [0.85]
  let rotor: SceneObject | null = null
  const part = (parent: SceneObject, name: string, mesh: RenderMesh, mat: Material, pos: vec3, scale: vec3, rot?: quat) => {
    kit.part(parent, name, mesh, mat, pos, scale, rot)
  }
  const rz = (a: number) => quat.angleAxis(a, vec3.forward())
  if (kind === "plane") {
    part(root, "Fuselage", kit.box, main, new vec3(0, 0, 0), new vec3(S * 0.12, S * 0.92, t))
    part(root, "Nose", kit.sphere, main, new vec3(0, S * 0.44, 0), new vec3(S * 0.12, S * 0.12, t))
    part(root, "WingL", kit.box, main, new vec3(-S * 0.24, S * 0.02, 0), new vec3(S * 0.5, S * 0.13, t), rz(0.32))
    part(root, "WingR", kit.box, main, new vec3(S * 0.24, S * 0.02, 0), new vec3(S * 0.5, S * 0.13, t), rz(-0.32))
    part(root, "TailL", kit.box, main, new vec3(-S * 0.09, -S * 0.4, 0), new vec3(S * 0.2, S * 0.08, t), rz(0.3))
    part(root, "TailR", kit.box, main, new vec3(S * 0.09, -S * 0.4, 0), new vec3(S * 0.2, S * 0.08, t), rz(-0.3))
  } else if (kind === "helicopter") {
    part(root, "Body", kit.sphere, main, new vec3(0, S * 0.08, 0), new vec3(S * 0.3, S * 0.38, t))
    part(root, "Boom", kit.box, main, new vec3(0, -S * 0.27, 0), new vec3(S * 0.07, S * 0.42, t))
    part(root, "TailFin", kit.box, main, new vec3(0, -S * 0.47, 0), new vec3(S * 0.2, S * 0.06, t))
    rotor = makeObj(root, "RotorCross")
    rotor.getTransform().setLocalPosition(new vec3(0, S * 0.08, t))
    const blade = kit.uniqueUnlit(new vec4(color.x, color.y, color.z, 0.7))
    mats.push(blade)
    base.push(0.7)
    part(rotor, "BladeA", kit.box, blade, vec3.zero(), new vec3(S, S * 0.05, t), rz(0.785))
    part(rotor, "BladeB", kit.box, blade, vec3.zero(), new vec3(S, S * 0.05, t), rz(-0.785))
  } else {
    part(root, "Dot", kit.sphere, main, vec3.zero(), new vec3(S * 0.34, S * 0.34, S * 0.34))
    const ring = kit.uniqueUnlit(new vec4(color.x, color.y, color.z, 0.35))
    mats.push(ring)
    base.push(0.35)
    const n = 24
    const r = S * 0.48
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      part(root, "Ring_" + i, kit.box, ring, new vec3(Math.cos(a) * r, Math.sin(a) * r, 0), new vec3(t * 1.2, ((Math.PI * 2 * r) / n) * 0.9, t), rz(a))
    }
  }
  return {root, materials: mats, baseAlpha: base, rotor}
}

/** Brightness 0..1 multiplies alpha between base and fully opaque. */
export function setGlyphBrightness(g: BuiltGlyph, color: vec4, brightness: number): void {
  for (let i = 0; i < g.materials.length; i++) {
    const a = g.baseAlpha[i] + (1 - g.baseAlpha[i]) * brightness
    g.materials[i].mainPass.baseColor = new vec4(color.x, color.y, color.z, a)
  }
}

export function spinGlyphRotor(g: BuiltGlyph, dt: number, revPerSec: number): void {
  if (!g.rotor) return
  const t = g.rotor.getTransform()
  t.setLocalRotation(t.getLocalRotation().multiply(quat.angleAxis(revPerSec * dt * Math.PI * 2, vec3.forward())))
}
