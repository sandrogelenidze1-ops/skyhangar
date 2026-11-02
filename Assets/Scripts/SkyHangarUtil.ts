// SkyHangarUtil.ts
// Owns: pure math + small scene helpers shared by every SkyHangar module (sky directions,
// yaw frames, easing, colour parsing, primitive "part" placement with unit-normalised meshes).
// Expects: nothing (plain module). Must not: hold state or touch UI/text.

import {MESH_BOUNDS} from "./SkyHangarMeshes"

export const DEG = Math.PI / 180

/** Compass azimuth (0 = north = start-forward -Z, 90 = east = +X) + elevation -> unit world dir. */
export function skyDir(azDeg: number, elDeg: number): vec3 {
  const az = azDeg * DEG
  const el = elDeg * DEG
  return new vec3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
}

/** Horizontal compass heading -> unit horizontal world vector. */
export function headingDir(trackDeg: number): vec3 {
  const t = trackDeg * DEG
  return new vec3(Math.sin(t), 0, -Math.cos(t))
}

/** Yaw (radians) of a camera's forward, measured so that yawFrame(yaw) reproduces it. */
export function yawOf(forward: vec3): number {
  return Math.atan2(forward.x, -forward.z)
}

export function flatForward(yaw: number): vec3 {
  return new vec3(Math.sin(yaw), 0, -Math.cos(yaw))
}

export function flatRight(yaw: number): vec3 {
  return new vec3(Math.cos(yaw), 0, Math.sin(yaw))
}

/** Offset in a yaw-only frame: x = right, y = up, z = forward-negative (Lens style: -z is ahead). */
export function yawOffset(origin: vec3, yaw: number, local: vec3): vec3 {
  const f = flatForward(yaw)
  const r = flatRight(yaw)
  return origin.add(r.uniformScale(local.x)).add(new vec3(0, local.y, 0)).add(f.uniformScale(-local.z))
}

export function yawRotation(yaw: number): quat {
  return quat.angleAxis(-yaw, vec3.up())
}

/** Rotation that points a model's -Z front toward dir. */
export function faceDir(dir: vec3, up?: vec3): quat {
  const d = dir.normalize()
  let u = up ?? vec3.up()
  if (Math.abs(d.dot(u)) > 0.98) u = new vec3(0, 0, 1)
  return quat.lookAt(d.uniformScale(-1), u)
}

/** Rotation that points an object's +Z (text front) toward the camera. */
export function faceCamera(pos: vec3, camPos: vec3): quat {
  const d = camPos.sub(pos)
  if (d.length < 0.001) return quat.quatIdentity()
  return quat.lookAt(d.normalize(), vec3.up())
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t)
  return 1 - u * u * u
}

export function easeInOut(t: number): number {
  const x = clamp01(t)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export function bezier3(a: vec3, b: vec3, c: vec3, d: vec3, t: number): vec3 {
  const u = 1 - t
  return a
    .uniformScale(u * u * u)
    .add(b.uniformScale(3 * u * u * t))
    .add(c.uniformScale(3 * u * t * t))
    .add(d.uniformScale(t * t * t))
}

export function hexColor(hex: string, alpha: number = 1): vec4 {
  const h = hex.replace("#", "")
  const r = parseInt(h.substring(0, 2), 16) / 255
  const g = parseInt(h.substring(2, 4), 16) / 255
  const b = parseInt(h.substring(4, 6), 16) / 255
  return new vec4(r, g, b, alpha)
}

/** Rotate unit vector d toward tangent t by angle (radians) — a great-circle step on the dome. */
export function greatCircle(d: vec3, t: vec3, angle: number): vec3 {
  return d.uniformScale(Math.cos(angle)).add(t.uniformScale(Math.sin(angle))).normalize()
}

/** Tangent of travel on the sky dome for an object at dir d moving with compass heading track. */
export function skyTangent(d: vec3, trackDeg: number): vec3 {
  const h = headingDir(trackDeg)
  const t = h.sub(d.uniformScale(h.dot(d)))
  if (t.length < 0.0001) return new vec3(1, 0, 0)
  return t.normalize()
}

export function makeObj(parent: SceneObject | null, name: string): SceneObject {
  const o = global.scene.createSceneObject(name)
  if (parent) o.setParent(parent)
  return o
}

/** Material cache + mesh normaliser for primitive-built geometry. */
export class PartKit {
  private colorCache: {[key: string]: Material} = {}
  private unitScale: Map<RenderMesh, vec3> = new Map()
  private centers: Map<RenderMesh, vec3> = new Map()

  constructor(
    public box: RenderMesh,
    public cylinder: RenderMesh,
    public sphere: RenderMesh,
    public cone: RenderMesh,
    public litMat: Material,
    public unlitMat: Material
  ) {}

  /** A cloned material for a colour (cached per colour + lit flag). Alpha < 1 only on unlit. */
  mat(color: vec4, lit: boolean): Material {
    const key = (lit ? "L" : "U") + color.x.toFixed(3) + color.y.toFixed(3) + color.z.toFixed(3) + color.w.toFixed(3)
    let m = this.colorCache[key]
    if (!m) {
      m = (lit ? this.litMat : this.unlitMat).clone()
      m.mainPass.baseColor = color
      this.colorCache[key] = m
    }
    return m
  }

  /** Unique (uncached) unlit material, for things that fade/brighten individually. */
  uniqueUnlit(color: vec4): Material {
    const m = this.unlitMat.clone()
    m.mainPass.baseColor = color
    return m
  }

  private norm(mesh: RenderMesh): {scale: vec3; center: vec3} {
    let s = this.unitScale.get(mesh)
    let c = this.centers.get(mesh)
    if (!s || !c) {
      const known = MESH_BOUNDS.get(mesh)
      const mn = known ? known.min : mesh.aabbMin
      const mx = known ? known.max : mesh.aabbMax
      const size = mx.sub(mn)
      s = new vec3(1 / Math.max(size.x, 0.0001), 1 / Math.max(size.y, 0.0001), 1 / Math.max(size.z, 0.0001))
      c = mn.add(mx).uniformScale(0.5)
      this.unitScale.set(mesh, s)
      this.centers.set(mesh, c)
    }
    return {scale: s, center: c}
  }

  /**
   * Places a primitive so its bounding box is exactly `size` cm and centred at `pos` (parent-local),
   * rotated by `rot`. Returns the visual SceneObject.
   */
  part(parent: SceneObject, name: string, mesh: RenderMesh, material: Material, pos: vec3, size: vec3, rot?: quat): SceneObject {
    const holder = makeObj(parent, name)
    const ht = holder.getTransform()
    ht.setLocalPosition(pos)
    if (rot) ht.setLocalRotation(rot)
    const vis = makeObj(holder, name + "_Mesh")
    const n = this.norm(mesh)
    const sc = new vec3(size.x * n.scale.x, size.y * n.scale.y, size.z * n.scale.z)
    const vt = vis.getTransform()
    vt.setLocalScale(sc)
    vt.setLocalPosition(new vec3(-n.center.x * sc.x, -n.center.y * sc.y, -n.center.z * sc.z))
    const rmv = vis.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = mesh
    rmv.mainMaterial = material
    return holder
  }

  /** Re-colour every RenderMeshVisual under root with one material. */
  static setMaterialAll(root: SceneObject, material: Material): void {
    const rmv = root.getComponent("Component.RenderMeshVisual") as RenderMeshVisual | null
    if (rmv) rmv.mainMaterial = material
    for (let i = 0; i < root.getChildrenCount(); i++) PartKit.setMaterialAll(root.getChild(i), material)
  }
}

/** Luminance floor for the preview backdrop by time of day: Day 0.62, Dusk 0.5, Night 0.38 (w = [day, dusk, night] weights, so it eases smoothly). */
export function luminanceFloor(w: number[]): number {
  return 0.62 * w[0] + 0.5 * w[1] + 0.38 * w[2]
}

/**
 * Lift a colour to at least `floor` luminance while keeping its hue: scale it up, and if a channel clips, ease the rest toward white.
 * The preview treats near-black lens pixels as see-through (additive display simulation), so nothing in the backdrop may go below this.
 */
export function minLuminance(c: number[], floor: number): [number, number, number] {
  const lum = (x: number[]) => x[0] * 0.3 + x[1] * 0.4 + x[2] * 0.3
  const l = lum(c)
  if (l >= floor) return [c[0], c[1], c[2]]
  // scale all channels together (hue AND saturation kept); only if a channel clips, desaturate a little (at most 40% of the white mix)
  const k = floor / Math.max(l, 0.02)
  const o = [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]
  const f = Math.max(0, (floor - lum(o)) / Math.max(1 - lum(o), 0.01)) * 0.4
  return [o[0] + (1 - o[0]) * f, o[1] + (1 - o[1]) * f, o[2] + (1 - o[2]) * f]
}

/**
 * Compensation for the preview's dim step (editor only). Measured against the preview: a lens colour c (0..1) is shown as about 80 + 175 c
 * above the editor floor plane's far edge and as 44 + 202 c below it (fitted from sampling both sides, including with compensation on), so
 * the colour that looks the same below the edge is c' = (36 + 175 c) / 202. That reaches c' = 1 at STEP_MAX_C = 0.95, so practically every colour
 * can be matched. `weight` (0..1) eases the compensation in over the +-0.5 degree band at the edge.
 */
export const STEP_MAX_C = 0.949
export function horizonStepCompensate(c: number[], weight: number = 1): [number, number, number] {
  const f = (x: number) => x + (Math.max(0, Math.min(1, (36 + 175 * x) / 202)) - x) * weight
  return [f(c[0]), f(c[1]), f(c[2])]
}

/** Brighter luminance floor for LARGE flat surfaces (walls, roof, ground, parapet, door panels): Day 0.65, Dusk 0.55, Night 0.45. */
export function largeSurfaceFloor(w: number[]): number {
  return 0.65 * w[0] + 0.55 * w[1] + 0.45 * w[2]
}

/** Elevation (degrees) of the editor floor plane's far edge, where the preview's dim step sits (about 1.7 degrees below the true horizon). */
export const EDITOR_EDGE_DEG = -1.67
