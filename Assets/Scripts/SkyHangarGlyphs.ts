// SkyHangarGlyphs.ts
// Owns: flat, camera-facing marker glyphs for the sky (and the radar): an airliner pictogram (one polygon, nose on local +Y,
// wings and tailplane swept BACK, tips toward -Y), a helicopter with a rotor cross, and a satellite dot with a faint ring.
// Glyphs lie in the local XY plane facing +Z, sized by `span` (cm, the widest dimension).
// Expects: a PartKit. Must not: hold interaction or state.

import {SkyKind} from "./SkyHangarFlightData"
import {PartKit, makeObj} from "./SkyHangarUtil"
import {polygonMesh, ringMesh, MESH_BOUNDS} from "./SkyHangarMeshes"

export interface BuiltGlyph {
  root: SceneObject
  /** Materials to brighten/dim together (alpha is driven by the caller). */
  materials: Material[]
  baseAlpha: number[]
  /** Rotor cross pivot (helicopters) — spins about local Z. */
  rotor: SceneObject | null
}

/** Airliner pictogram outline in a 100 x 100 box (y down, nose up): fuselage x 43.5-56.5 y 4-92 (front 25 % tapering to a soft point), wings swept back, tailplane swept back. */
function planeOutline(): number[][] {
  const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): number[][] => {
    const out: number[][] = []
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n
      out.push([cx + rx * Math.cos(a), cy - ry * Math.sin(a)])
    }
    return out
  }
  const right: number[][] = [
    ...arc(50, 6.3, 2.3, 2.3, Math.PI / 2, 0, 5), // soft rounded tip, right half: 4.6 wide = 35 % of the 13-wide fuselage, top at y = 4
    ...[1, 2, 3, 4, 5, 6, 7].map((i): number[] => { const s = i / 8; return [52.3 + 4.2 * (1 - Math.pow(1 - s, 1.7)), 6.3 + 19.7 * s] }), // the fuselage front 25 % (y 4..26) tapers out to full width
    [56.5, 26],
    [56.5, 36], [94, 62], // wing leading edge
    ...[0, 1, 2, 3, 4, 5, 6].map((i): number[] => { const a = (Math.PI * i) / 6; return [94 + 3.5 * Math.sin(a), 65.5 - 3.5 * Math.cos(a)] }), // rounded wing tip
    [56.5, 56], [56.5, 78], [73, 90], // wing trailing edge, fuselage, tailplane leading edge
    ...[0, 1, 2, 3, 4].map((i): number[] => { const a = (Math.PI * i) / 4; return [73 + 2 * Math.sin(a), 92 - 2 * Math.cos(a)] }), // rounded tailplane tip
    [54.12, 90.72], [53, 92] // tailplane trailing edge meets the tapered tail
  ]
  const left = right.map(([x, y]) => [100 - x, y]).reverse()
  const same = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6
  const all = [...right, ...left].filter((p, i, arr) => i === 0 || !same(p, arr[i - 1]))
  if (same(all[0], all[all.length - 1])) all.pop()
  return all
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
    const mesh = polygonMesh("planeGlyph", planeOutline().map(([x, y]) => [(x - 50) / 100, (50 - y) / 100]))
    const bb = MESH_BOUNDS.get(mesh)!
    const ctr = bb.min.add(bb.max).uniformScale(0.5), size = bb.max.sub(bb.min)
    part(root, "Plane", mesh, main, new vec3(ctr.x * S, ctr.y * S, 0), new vec3(size.x * S, size.y * S, t))
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
    const mesh = ringMesh("sat_" + S.toFixed(3), r, t * 1.2, t, n, "xy") // one draw call instead of 24 boxes
    const bb = MESH_BOUNDS.get(mesh)!
    part(root, "Ring", mesh, ring, bb.min.add(bb.max).uniformScale(0.5), bb.max.sub(bb.min))
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
