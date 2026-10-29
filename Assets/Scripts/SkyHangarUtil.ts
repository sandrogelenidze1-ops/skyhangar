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
