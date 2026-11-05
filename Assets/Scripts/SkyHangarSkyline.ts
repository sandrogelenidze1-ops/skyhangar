// SkyHangarSkyline.ts
// Owns: the PREVIEW-ONLY distant skyline, a ring of 16 hazy towers well behind the existing city, built once at startup.
//  - Two merged meshes only: the towers (one painted atlas, bodies + setback crowns + antennas) and the red antenna beacons.
//  - Opaque, depth-tested, unlit (fixed painted colours), so nothing is blended and nothing runs per frame. Time of Day only changes one material
//    tint, and only when SkyHangarRooftopBackdrop's own 10 Hz apply() calls setTimeOfDay.
// Geometry and colours come from SkyHangarSkylineSpec (pure, checked under Node). Must not: interact, show UI or touch the existing buildings.

import {makeObj} from "./SkyHangarUtil"
import {MeshBatch} from "./SkyHangarBatch"
import {Tower, skylineTowers, paintSkylineAtlas, bodyUV, crownUV, ROOF_UV, SKY_BASE, SKY_ATLAS_W, SKY_ATLAS_H} from "./SkyHangarSkylineSpec"

const TEX_MAT = requireAsset("../SkyHangar/Materials/SH_SkyTex.mat") as Material
const ORDER_SKYLINE = -126 // just behind the city (-125); depth testing does the real sorting
const ORDER_SKYLINE_BEACON = -121

// Tint on the painted atlas for [day, dusk, night]. Painted body luminance is ~0.63+, so these keep it above the backdrop floors (0.62 / 0.5 / 0.38).
export const SKYLINE_TINT: number[][] = [[1.0, 1.0, 1.0], [1.0, 0.82, 0.86], [0.72, 0.76, 0.98]]

export class SkyHangarSkyline {
  readonly towers: Tower[] = skylineTowers()
  private mat: Material
  private root: SceneObject
  triangles = 0
  meshObjects = 0

  /** Build the skyline under `parent` (which sits at the camera position). `beaconMat` is the shared red unlit material. */
  constructor(parent: SceneObject, beaconMat: Material) {
    this.root = makeObj(parent, "Skyline")
    const tex = ProceduralTextureProvider.createWithFormat(SKY_ATLAS_W, SKY_ATLAS_H, TextureFormat.RGBA8Unorm)
    ;(tex.control as ProceduralTextureProvider).setPixels(0, 0, SKY_ATLAS_W, SKY_ATLAS_H, paintSkylineAtlas(this.towers))
    const m = TEX_MAT.clone()
    m.mainPass.baseTex = tex
    m.mainPass.baseColor = new vec4(1, 1, 1, 1)
    m.mainPass.blendMode = BlendMode.Disabled
    m.mainPass.depthWrite = true
    m.mainPass.depthTest = true
    m.mainPass.twoSided = true
    this.mat = m

    const body = new MeshBatch()
    const lights = new MeshBatch()
    const uvB = [0, 0, 1, 1]
    for (const t of this.towers) {
      const cx = Math.sin(t.az) * t.dist, cz = -Math.cos(t.az) * t.dist
      const yaw = -t.az
      const bodyTop = t.top - t.crownH
      body.box(cx, (SKY_BASE + bodyTop) / 2, cz, t.w, bodyTop - SKY_BASE, t.d, yaw, bodyUV(t), ROOF_UV)
      if (t.crownH > 0) body.box(cx, bodyTop + t.crownH / 2, cz, t.crownW, t.crownH, t.d * 0.72, yaw, crownUV(t), ROOF_UV)
      if (t.antH > 0) {
        const aw = 10
        body.box(cx, t.top + t.antH / 2, cz, aw, t.antH, aw, yaw, ROOF_UV)
        if (t.beacon) lights.box(cx, t.top + t.antH + 12, cz, 26, 26, 26, yaw, uvB) // ~0.3 degree red light on the antenna tip
      }
    }
    const a = body.build(this.root, "Skyline_Towers", this.mat, ORDER_SKYLINE)
    const b = lights.build(this.root, "Skyline_Beacons", beaconMat, ORDER_SKYLINE_BEACON)
    this.meshObjects = a.length + b.length
    this.triangles = (body.count + lights.count) / 2 // every quad is two triangles; count is in vertices (4 per quad)
    print("[Skyline] " + this.towers.length + " towers, " + this.triangles + " triangles, " + this.meshObjects + " meshes")
  }

  /** Tint by Time of Day weights [day, dusk, night]. Called from the backdrop's slow apply(); not per frame. */
  setTimeOfDay(w: number[]): void {
    const t = [0, 1, 2].map((k) => SKYLINE_TINT[0][k] * w[0] + SKYLINE_TINT[1][k] * w[1] + SKYLINE_TINT[2][k] * w[2])
    this.mat.mainPass.baseColor = new vec4(t[0], t[1], t[2], 1)
  }
}
