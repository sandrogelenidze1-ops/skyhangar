// SkyHangarSkyline.ts
// Owns: the PREVIEW-ONLY distant skyline, a flat dusky-violet SILHOUETTE far beyond the existing buildings (nine distinct tower forms plus a hazier back row).
// Two strips of one low-poly cylinder around the viewer, built once: the silhouette (alpha-masked texture, see SkyHangarSkylineSpec) and, on top of it,
// the tiny window dashes and red beacons (a second texture), so the lights can be switched off by day without repainting anything.
// Both are alpha blended (like the cloud layers), depth-tested and never write depth. No per-frame work: Time of Day only changes two material colours, from
// the backdrop's own slow apply(). Must not: interact, show UI or touch the existing buildings.

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
  triangles = 0
  meshObjects = 0

  constructor(parent: SceneObject) {
    this.root = makeObj(parent, "Skyline")
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

  /** Time of Day weights [day, dusk, night] and the backdrop's night-light amount (0 by day .. 1 at night). Called from the backdrop's slow apply(); not per frame. */
  setTimeOfDay(w: number[], light: number): void {
    const look = skylineLook(w, light)
    this.silMat.mainPass.baseColor = new vec4(look.silTint[0], look.silTint[1], look.silTint[2], look.silAlpha)
    this.lightMat.mainPass.baseColor = new vec4(1, 1, 1, look.lightAlpha)
  }
}
