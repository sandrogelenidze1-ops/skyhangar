// SkyHangarSkyline.ts
// Owns: the PREVIEW-ONLY distant skyline, a flat dusky-violet SILHOUETTE far beyond the existing buildings (eight tower forms, four towers per side all the way around, plus a hazier low back row).
// Two strips of one low-poly cylinder around the viewer, built once: the silhouette (alpha-masked texture, see SkyHangarSkylineSpec) and, on top of it,
// the tiny window dashes and red beacons (a second texture), so the lights can be switched off by day without repainting anything.
// Both are alpha blended (like the cloud layers), depth-tested and never write depth. Its only per-frame work is follow(): one transform write, and only when the camera moved, so the ring stays
// centred on the viewer. Time of Day only changes two material colours, from the backdrop's own slow apply(). Must not: interact, show UI or touch the existing buildings.

import {makeObj} from "./SkyHangarUtil"
import {skylineTowers, paintSkyline, stripGeometry, skylineLook, Tower, TEX_W, TEX_H} from "./SkyHangarSkylineSpec"

const TEX_MAT = requireAsset("../SkyHangar/Materials/SH_SkyTex.mat") as Material
const ORDER_SKYLINE = -124 // right after the city meshes (-125); depth testing keeps the nearer buildings in front
const ORDER_LIGHTS = -123

export class SkyHangarSkyline {
  readonly towers: Tower[] = skylineTowers()
  readonly root: SceneObject
  private silMat: Material
  private lightMat: Material
  private baseY = 0 // world height of the skyline's centre (kept: only the horizontal position follows the camera)
  private lastX = 1e9
  private lastZ = 1e9
  triangles = 0
  meshObjects = 0

  constructor(parent: SceneObject) {
    this.root = makeObj(parent, "Skyline")
    this.baseY = this.root.getTransform().getWorldPosition().y
    const painted = paintSkyline(this.towers)
    this.silMat = this.strip("Skyline_Strip", painted.sil, ORDER_SKYLINE)
    this.lightMat = this.strip("Skyline_Lights", painted.lights, ORDER_LIGHTS)
    this.setTimeOfDay([0, 0, 1], 1)
    print("[Skyline] silhouette: " + this.towers.length + " towers, " + painted.lit + " of " + painted.windows + " windows lit, " + this.triangles + " triangles, " + this.meshObjects + " strips")
  }

  /** One blended cylinder strip with its own texture. */
  private strip(name: string, pixels: Uint8Array, order: number): Material {
    const tex = ProceduralTextureProvider.createWithFormat(TEX_W, TEX_H, TextureFormat.RGBA8Unorm)
    ;(tex.control as ProceduralTextureProvider).setPixels(0, 0, TEX_W, TEX_H, pixels)
    const m = TEX_MAT.clone()
    m.mainPass.baseTex = tex
    m.mainPass.baseColor = new vec4(1, 1, 1, 1)
    m.mainPass.blendMode = BlendMode.Normal
    m.mainPass.depthTest = true
    m.mainPass.depthWrite = false
    m.mainPass.twoSided = true
    // never culled: a huge user-defined bounding box (the camera always sits inside the strip anyway, because it follows the camera)
    m.mainPass.frustumCullMode = FrustumCullMode.UserDefinedAABB
    m.mainPass.frustumCullMin = new vec3(-30000, -30000, -30000)
    m.mainPass.frustumCullMax = new vec3(30000, 30000, 30000)
    const g = stripGeometry()
    const b = new MeshBuilder([
      {name: "position", components: 3},
      {name: "normal", components: 3, normalized: true},
      {name: "texture0", components: 2}
    ])
    b.topology = MeshTopology.Triangles
    b.indexType = MeshIndexType.UInt16
    const v: number[] = []
    for (let i = 0; i < g.pos.length / 3; i++) v.push(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2], 0, 1, 0, g.uv[i * 2], g.uv[i * 2 + 1])
    b.appendVerticesInterleaved(v)
    b.appendIndices(g.idx)
    b.updateMesh()
    const o = makeObj(this.root, name)
    const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = b.getMesh()
    rmv.mainMaterial = m
    rmv.setRenderOrder(order)
    this.meshObjects++
    this.triangles += g.idx.length / 3
    return m
  }

  /**
   * Keep the skyline centred on the camera's horizontal position, in world orientation: its distance never changes, so it can't get closer, further or
   * out of range, and it shows on every side. One transform write, and only when the camera has moved at least 0.5 cm.
   */
  follow(cam: vec3): void {
    if (Math.abs(cam.x - this.lastX) < 0.5 && Math.abs(cam.z - this.lastZ) < 0.5) return
    this.lastX = cam.x
    this.lastZ = cam.z
    this.root.getTransform().setWorldPosition(new vec3(cam.x, this.baseY, cam.z))
  }

  /** Time of Day weights [day, dusk, night] and the backdrop's night-light amount (0 by day .. 1 at night). Called from the backdrop's slow apply(); not per frame. */
  setTimeOfDay(w: number[], light: number): void {
    const look = skylineLook(w, light)
    this.silMat.mainPass.baseColor = new vec4(look.silTint[0], look.silTint[1], look.silTint[2], look.silAlpha)
    this.lightMat.mainPass.baseColor = new vec4(1, 1, 1, look.lightAlpha)
  }
}
