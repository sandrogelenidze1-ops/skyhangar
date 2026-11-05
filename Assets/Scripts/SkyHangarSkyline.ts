// SkyHangarSkyline.ts
// Owns: the PREVIEW-ONLY distant skyline, a flat dusky-violet SILHOUETTE far beyond the existing buildings. One texture (alpha-masked skyline with a haze
// gradient, sparse light specks and a few red spire beacons, see SkyHangarSkylineSpec) on one low-poly cylinder strip around the viewer: one mesh, one
// material, built once. No per-frame work; Time of Day only changes the material tint, from the backdrop's own slow apply().
// The strip is alpha blended (like the cloud layers), depth-tested and never writes depth. It stops at 8 degrees elevation, so the sky above stays clear.
// Must not: interact, show UI or touch the existing buildings.

import {makeObj} from "./SkyHangarUtil"
import {skylineTowers, paintSkyline, stripGeometry, Tower, TEX_W, TEX_H} from "./SkyHangarSkylineSpec"

const TEX_MAT = requireAsset("../SkyHangar/Materials/SH_SkyTex.mat") as Material
const ORDER_SKYLINE = -124 // right after the city meshes (-125); depth testing keeps the nearer buildings in front

// Tint on the painted silhouette for [day, dusk, night]: near neutral, so the colour stays a dusky violet-blue clearly above the floor.
export const SKYLINE_TINT: number[][] = [[1.0, 1.0, 1.0], [1.0, 0.97, 1.0], [0.92, 0.94, 1.0]]

export class SkyHangarSkyline {
  readonly towers: Tower[] = skylineTowers()
  readonly root: SceneObject
  private mat: Material
  triangles = 0
  meshObjects = 0

  constructor(parent: SceneObject) {
    this.root = makeObj(parent, "Skyline")
    const tex = ProceduralTextureProvider.createWithFormat(TEX_W, TEX_H, TextureFormat.RGBA8Unorm)
    ;(tex.control as ProceduralTextureProvider).setPixels(0, 0, TEX_W, TEX_H, paintSkyline(this.towers))
    const m = TEX_MAT.clone()
    m.mainPass.baseTex = tex
    m.mainPass.baseColor = new vec4(1, 1, 1, 1)
    m.mainPass.blendMode = BlendMode.Normal
    m.mainPass.depthTest = true
    m.mainPass.depthWrite = false
    m.mainPass.twoSided = true
    this.mat = m

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
    const o = makeObj(this.root, "Skyline_Strip")
    const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = b.getMesh()
    rmv.mainMaterial = m
    rmv.setRenderOrder(ORDER_SKYLINE)
    this.meshObjects = 1
    this.triangles = g.idx.length / 3
    print("[Skyline] silhouette strip: " + this.towers.length + " towers, " + this.triangles + " triangles, 1 mesh")
  }

  /** Tint by Time of Day weights [day, dusk, night]. Called from the backdrop's slow apply(); not per frame. */
  setTimeOfDay(w: number[]): void {
    const t = [0, 1, 2].map((k) => SKYLINE_TINT[0][k] * w[0] + SKYLINE_TINT[1][k] * w[1] + SKYLINE_TINT[2][k] * w[2])
    this.mat.mainPass.baseColor = new vec4(t[0], t[1], t[2], 1)
  }
}
