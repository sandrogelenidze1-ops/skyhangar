// SkyHangarRooftopBackdrop.ts
// Owns: the PREVIEW-ONLY city and rooftop under the PreviewBackdrop object, built for speed.
//  - Everything static is merged at startup into a few meshes (SkyHangarBatch): the whole city is FIVE meshes (one per horizon-step compensation level,
//    each with one shared facade atlas, SkyHangarFacade) and the roof is one mesh per material. No per-building objects, scripts or textures; nothing
//    is rebuilt per frame. Slow effects (flicker, beacons, lamp, Time of Day) run in a single 10 Hz tick.
//  - City: ~15 near buildings and 25 far ones, a realistic muted palette (70% neutral, 25% muted, 5% accent), facades with window grids, sills, balconies,
//    AC boxes, fire escapes and shopfronts baked into the atlas, varied rooftops (cap, setback, tank, antenna, AC boxes), a red warning beacon on top of the antenna of some roofs; distant roofs get small modern props (stairwell core, solar rows, AC units, glass railing).
//  - Roof: a 10 m x 10 m concrete slab, a low ledge, a thin see-through railing, stairwell + door, two AC units, a water tank, pipes, a wall lamp.
//    Roof surfaces are opaque lit PBR materials with the large-surface luminance floor (Day 0.65, Dusk 0.55, Night 0.45) and the horizon compensation.
// Every material is fully opaque (no blending, depth write and depth test on). Time of Day comes from SkyHangarPreviewBackdrop (0 day, 0.5 dusk, 1 night).
// Disables itself on a real device. The city and roof are fixed in world space (only the sky dome follows the head), so walking gives normal parallax.
// Expects @inputs: camera object, sky controller (primitive kit). Must not: interact or show UI.

import {SkyHangarSkyController} from "./SkyHangarSkyController"
import {makeObj, luminanceFloor, largeSurfaceFloor, minLuminance} from "./SkyHangarUtil"
import {MeshBatch} from "./SkyHangarBatch"
import {SkyHangarSkyline} from "./SkyHangarSkyline"
import {STYLES, NEUTRAL_STYLES, MUTED_STYLES, ACCENT_STYLE, FacadeAtlas, FacadeTime, facadeTimeFor, paintAtlas, paintFlicker, variantUV, propsAtlasTexture, PROPS_UV, V_WIN, V_AC, V_BALC, V_FIRE, V_SHOP, V_L, V_R, V_T, S_WALL, S_WALLSH, S_CAP, S_METAL, S_TANK, S_AC} from "./SkyHangarFacade"

const DEG = Math.PI / 180

const ORDER_CITY = -125
const ORDER_BEACON = -122
const ORDER_ROOF = -108

const CITY_GAP = 450 // clear distance from the parapet's outer edge to the nearest facade, cm (at least 4 m)
const ROOF_HALF = 1500 // slab reaches 15 m each way: 30 m x 30 m, so the stairwell and tank can stand 12-14 m out
const ROOF_LEDGE = 110 // parapet height including its cap, cm
const ROOF_RAIL = 130 // top of the see-through railing above the floor, cm
const GROUND_DROP = 1500 // street level (where the far blocks stand) this far below the eyes, cm
// The preview simulates the additive Specs display: DARK lens pixels are see-through and show the editor's floor grid and dark floor band, so every
// colour keeps a luminance floor (luminanceFloor for buildings, largeSurfaceFloor for big flat surfaces) instead of going near-black.

type RGB = [number, number, number]

// Wall colours and glass come from SkyHangarFacade (facadeTimeFor): the night palette is the reference, the day is a gentle grade of the same colours.
const HORIZON: RGB[] = [[0.44, 0.69, 0.95], [1.0, 0.55, 0.24], [0.45, 0.08, 0.74]] // the sky script's horizon colours
const ATLAS_HAZE = [0.06, 0.22] // day haze of the near / far facade atlas (0 = none)
const AMB_LEVEL = [1.0, 0.85, 0.6]
const AMB_TINT: RGB[] = [[1.0, 0.96, 0.88], [1.0, 0.72, 0.62], [0.42, 0.52, 1.0]]
const TEX_MAT = requireAsset("../SkyHangar/Materials/SH_SkyTex.mat") as Material
const LIT_MAT = requireAsset("../SkyHangar/Materials/SH_Lit.mat") as Material

// Three rings: distance, count, top elevation range (deg), bay size (deg), width range (cm), street base. A and B are the near buildings (~15), C the far skyline (25).
const RINGS = [
  {name: "A", dist: 2500, count: 8, lo: -1.7, hi: -0.3, bayDeg: 1.1, wMin: 300, wMax: 480, shop: true, base: -GROUND_DROP, full: true},
  {name: "B", dist: 3300, count: 9, lo: -1.5, hi: 1.0, bayDeg: 0.9, wMin: 320, wMax: 520, shop: false, base: -GROUND_DROP, full: true},
  {name: "C", dist: 4600, count: 25, lo: -2.0, hi: 2.2, bayDeg: 0.75, wMin: 0, wMax: 0, shop: false, base: -GROUND_DROP, full: false}
]

@component
export class SkyHangarRooftopBackdrop extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarRooftopBackdrop – preview-only city and rooftop</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("The main camera SceneObject")
  cameraObject!: SceneObject
  @input
  @hint("Sky controller (shared primitive kit)")
  sky!: SkyHangarSkyController
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Show the backdrop (preview only — turn off before publishing to Specs)")
  showBackdrop: boolean = true
  @input
  @hint("Eye height above the roof floor, cm")
  @widget(new SliderWidget(120, 200, 1))
  eyeHeightCm: number = 160
  @ui.group_end

  private farRoot!: SceneObject
  private roofRoot!: SceneObject
  private roofMats: {m: Material; c: RGB; rim: number}[] = []
  private roofBatches: {b: MeshBatch; m: Material}[] = []
  private slabMat!: Material
  private lampBulbMat!: Material
  private beaconMat!: Material
  private modernB = new MeshBatch() // modern roof props of the distant buildings (stairwells, AC units, railings)
  private beaconPts: number[][] = [] // beacon light positions (tip of a roof pole), filled while the buildings are made
  private skyline: SkyHangarSkyline | null = null // the distant skyline beyond the far ring (two merged meshes)
  private atlases: FacadeAtlas[] = []
  private ft: FacadeTime | null = null
  private fts: FacadeTime[] = [] // facade time per atlas (near buildings, far ring)
  private flickerCursor = 0
  private planeMesh: RenderMesh | null = null
  private todSource: any = null
  private searchFrame = 0
  private tod = 0.5
  private applied = -1
  private light = 0
  private beaconLight = 0
  private built = false
  private lastApply = -1
  private lastSlow = -1
  private lastFlicker = -1

  onAwake(): void {
    if (!global.deviceInfoSystem.isEditor()) {
      this.sceneObject.enabled = false
      return
    }
    if (!this.cameraObject || !this.sky) {
      print("SkyHangarRooftopBackdrop: required @input not wired")
      return
    }
    // Live under PreviewBackdrop so a single switch (disabled on device) removes the whole backdrop.
    const pb = findByName(null, "PreviewBackdrop")
    if (pb && pb !== this.sceneObject) this.sceneObject.setParent(pb)
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  isBuilt(): boolean { return this.built }

  // ---------- materials ----------
  /** Opaque lit PBR material: no blending, depth write on, matt unless told otherwise. */
  private litMat(c: RGB, rough: number, metal: number, rim: number, tex?: Texture): Material {
    const m = LIT_MAT.clone()
    m.mainPass.blendMode = BlendMode.Disabled
    m.mainPass.depthWrite = true
    m.mainPass.depthTest = true
    m.mainPass.twoSided = false
    m.mainPass.baseColor = new vec4(c[0], c[1], c[2], 1)
    m.mainPass.roughness = rough
    m.mainPass.metallic = metal
    if (tex) m.mainPass.baseTex = tex
    this.roofMats.push({m, c, rim})
    return m
  }

  // ---------- build ----------
  private build(): void {
    const kit = this.sky.partKit
    if (!kit) return
    const cam = this.cameraObject.getTransform().getWorldPosition()
    this.sceneObject.getTransform().setWorldPosition(cam)
    this.sceneObject.getTransform().setWorldRotation(quat.quatIdentity())
    const floorY = -this.eyeHeightCm // floor 1.6 m below the eyes

    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

    this.farRoot = makeObj(this.sceneObject, "FarLayer")
    const city = makeObj(this.farRoot, "City")

    // one facade atlas and one merged batch (the editor tone is uniform, so there are no elevation bands)
    const atlasMats: Material[] = []
    const batches: MeshBatch[] = []
    for (let n = 0; n < 2; n++) { // atlas 0: the near buildings (rings A, B); atlas 1: the far ring C, a little hazier by day
      const a = new FacadeAtlas()
      this.atlases.push(a)
      const m = opaqueTexMat(a.tex)
      m.mainPass.twoSided = true
      atlasMats.push(m)
      batches.push(new MeshBatch())
    }

    // Buildings
    RINGS.forEach((R, ri) => {
      const slot = (Math.PI * 2) / R.count
      for (let i = 0; i < R.count; i++) {
        const a = i * slot + (rnd() - 0.5) * slot * 0.5
        const signed = a > Math.PI ? a - Math.PI * 2 : a
        const front = Math.abs(signed) < Math.PI / 6 // the central 60 degrees ahead stay clear of close tall buildings
        let d = R.dist * (0.97 + rnd() * 0.06)
        let topEl = R.lo + Math.pow(rnd(), 2) * (R.hi - R.lo)
        if (ri === 2 && rnd() < 0.12) topEl = Math.min(R.hi * 1.7, topEl + 1.3) // a few taller towers on the far ring
        const w = ri === 2 ? d * slot * (0.72 + rnd() * 0.28) : R.wMin + rnd() * (R.wMax - R.wMin)
        const style = this.pickStyle(rnd)
        if (ri < 2) {
          // keep a clear gap from the (square) roof: every footprint corner must lie outside the parapet by CITY_GAP
          const clear = (dd: number): boolean => {
            const cx = Math.sin(a) * dd, cz = -Math.cos(a) * dd, rx = Math.cos(a), rz = Math.sin(a), fx = -Math.sin(a), fz = Math.cos(a)
            for (const [sx, sf] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
              const px = cx + rx * sx * w * 0.52 + fx * sf * 140, pz = cz + rz * sx * w * 0.52 + fz * sf * 140
              if (Math.max(Math.abs(px), Math.abs(pz)) < ROOF_HALF + 30 + CITY_GAP) return false
            }
            return true
          }
          while (!clear(d)) d += 50
        }
        if (front && ri === 0) continue
        if (front && ri === 1) continue
        const top = Math.tan(topEl * DEG) * d
        this.addBuilding(batches, R, ri, a, d, w, top, style, rnd)
      }
    })
    batches.forEach((b, k) => b.build(city, "City_" + k, atlasMats[k], ORDER_CITY))
    const modernMat = opaqueTexMat(roofSwatchTexture())
    modernMat.mainPass.twoSided = true
    this.modernB.build(city, "RoofModern", modernMat, ORDER_CITY)

    // red aircraft-warning beacons: a tiny light on top of a roof antenna (one batch, one material, blinking through its colour).
    // The poles themselves are part of the roof props above; only the lights are collected here.
    this.beaconMat = opaqueUnlit(kit, [1.0, 0.16, 0.1])
    const bb = new MeshBatch()
    const uvB = [0, 0, 1, 1]
    for (const q of this.beaconPts) {
      // ~12 cm light (a small double cone, close to a sphere) sitting on the pole tip
      bb.prism(q[0], q[1] - 6, q[2], 0.5, 6, 8, uvB, 12)
      bb.prism(q[0], q[1], q[2], 6, 6, 8, uvB, 0.08)
    }
    bb.build(city, "Beacons", this.beaconMat, ORDER_BEACON)
    this.skyline = new SkyHangarSkyline(city) // distant skyline, well behind ring C, below the plane / marker area

    this.buildRoof(kit, floorY, cam)
    this.built = true
    this.apply(this.tod)
  }

  /** ~70% neutral (concrete, stucco, brick, stone, off-white), ~25% muted (dusty teal, ochre, slate, sage), ~5% the one stronger accent. */
  private pickStyle(rnd: () => number): number {
    const r = rnd()
    if (r < 0.7) return NEUTRAL_STYLES[Math.floor(rnd() * NEUTRAL_STYLES.length)]
    if (r < 0.95) return MUTED_STYLES[Math.floor(rnd() * MUTED_STYLES.length)]
    return ACCENT_STYLE
  }

  /** One building: a shaded body, a facade grid with a window in every bay, and a rooftop; all appended to batches. */
  private addBuilding(batches: MeshBatch[], R: any, ri: number, a: number, d: number, w: number, top: number, style: number, rnd: () => number): void {
    const base = R.base
    const bt = batches[ri === 2 ? 1 : 0] // the far ring has its own (hazier) atlas
    const yaw = -a
    const cx = Math.sin(a) * d, cz = -Math.cos(a) * d
    const right = [Math.cos(a), 0, Math.sin(a)]
    const front = [-Math.sin(a), 0, Math.cos(a)]
    const uvSh = variantUV(style, S_WALLSH), uvCap = variantUV(style, S_CAP), uvWall = variantUV(style, S_WALL)
    if (top - base > 0.5) bt.box(cx, (base + top) / 2, cz, w, top - base, 260, yaw, uvSh, uvCap)
    // facade bays
    const bayW = d * Math.tan(R.bayDeg * DEG), bayH = bayW * 1.15
    const yBot = Math.max(base, Math.tan(-16 * DEG) * d) // nothing below the roof ledge's view is worth building
    const rows = Math.floor((top - yBot) / bayH)
    const cols = Math.max(2, Math.floor((w * 0.94) / bayW))
    if (rows >= 1) {
      const baseVisible = yBot <= base + 0.5
      const fireCol = rnd() < 0.15 ? 1 + Math.floor(rnd() * (cols - 2)) : -1
      const fc = [cx + front[0] * 136, 0, cz + front[2] * 136]
      for (let r = 0; r < rows; r++) {
        const yT = top - r * bayH, yB = yT - bayH
        for (let c = 0; c < cols; c++) {
          let vi: number
          if (r === rows - 1 && baseVisible && R.shop) vi = V_SHOP + (rnd() < 0.5 ? 0 : 1)
          else if (c === 0) vi = V_L + Math.floor(rnd() * 3)
          else if (c === cols - 1) vi = V_R + Math.floor(rnd() * 3)
          else if (r === 0) vi = V_T + Math.floor(rnd() * 3)
          else if (c === fireCol && r > 0) vi = V_FIRE + (r & 1)
          else {
            const q = rnd()
            vi = q < 0.07 ? V_AC + Math.floor(rnd() * 4) : q < 0.17 ? V_BALC + Math.floor(rnd() * 4) : V_WIN + Math.floor(rnd() * 12)
          }
          const x0 = (c - cols / 2) * bayW, x1 = x0 + bayW
          bt.quad(
            [fc[0] + right[0] * x0, yB, fc[2] + right[2] * x0], [fc[0] + right[0] * x1, yB, fc[2] + right[2] * x1],
            [fc[0] + right[0] * x1, yT, fc[2] + right[2] * x1], [fc[0] + right[0] * x0, yT, fc[2] + right[2] * x0],
            front[0], 0, front[2], variantUV(style, vi))
        }
      }
    }
    // rooftop: every building gets a parapet cap and its own mix of setback, tank, antenna and AC boxes (the far ring a lighter set)
    const rb = bt
    const on = (y: number, xo: number): number[] => [cx + right[0] * xo, y, cz + right[2] * xo]
    const capH = bayH * 0.16
    const uvMetal = variantUV(style, S_METAL), uvTank = variantUV(style, S_TANK), uvAc = variantUV(style, S_AC)
    rb.box(cx, top + capH / 2, cz, w * 1.03, capH, 275, yaw, uvCap)
    const y = top + capH
    let poleTop: number[] | null = null // tip of the roof antenna, if this roof has one
    // No stairwell / penthouse boxes on the distant roofs (clean flat roof lines). The random draws stay so every other building is unchanged.
    if (rnd() < 0.55) {
      rnd(); rnd(); rnd()
    }
    // No water tanks on the distant roofs (replaced by the modern roof props below). The random draw stays so every other building is unchanged.
    if (R.full && rnd() < 0.4) rnd()
    if (rnd() < 0.45) {
      const ah = bayH * (1.6 + 2 * rnd()), aw = Math.max(3, bayW * 0.07)
      const p = on(y + ah / 2, (rnd() - 0.5) * w * 0.6)
      rb.box(p[0], p[1], p[2], aw, ah, aw, yaw, uvMetal)
      poleTop = [p[0], y + ah, p[2]]
      if (R.full) rb.box(p[0], y + ah * 0.8, p[2], bayW * 0.5, Math.max(2, bayW * 0.05), Math.max(2, bayW * 0.05), yaw, uvMetal)
    }
    if (R.full && rnd() < 0.5) {
      const n = 1 + Math.floor(rnd() * 2)
      for (let k = 0; k < n; k++) {
        const p = on(y + bayH * 0.15, (rnd() - 0.5) * w * 0.6)
        rb.box(p[0], p[1], p[2], bayW * 0.5, bayH * 0.3, bayW * 0.4, yaw, uvAc)
      }
    }
    // Modern roof look (small and low, merged into one batch): stairwell core, AC / vent units, glass railing.
    // Placement comes from a private generator seeded by the building's hash, so no shared random numbers are drawn and each roof differs.
    const hs = Math.abs(Math.sin(a * 127.1 + d * 0.0311 + ri * 311.7) * 43758.5453) % 1
    let qs = Math.floor(hs * 1e9) + ri * 7919 + 1
    const q = (): number => ((qs = (qs * 16807) % 2147483647) / 2147483647)
    const mb = this.modernB
    const at = (xo: number, zo: number, yy: number): number[] => [cx + right[0] * xo + front[0] * zo, yy, cz + right[2] * xo + front[2] * zo]
    const side = q() < 0.5 ? -1 : 1
    if (q() < 0.6) {
      // stairwell / elevator core: ONE small box (<= 1.5 m tall and <= 8% of the building height; footprint <= 2 m x 2 m and <= 10% of the roof
      // width), wider than tall, with a thin darker door on its face. The same number of q() draws as before keeps the other props where they were.
      const u1 = q(), u2 = q(), u3 = q(), u4 = q(), u5 = q()
      const sw = Math.min(200, w * 0.1) * (0.7 + 0.3 * u2), sd = sw
      const sh = Math.min(150, (top - R.base) * 0.08, sw * 0.8) * (0.8 + 0.2 * u1)
      const p = at(side * w * (0.12 + 0.18 * u3), -u4 * 60, y)
      mb.box(p[0], y + sh / 2, p[2], sw, sh, sd, yaw, SW_GREY, SW_WHITE)
      const dx = sw * (u5 - 0.5) * 0.5 // door sits a little off-centre along the face
      const door = [p[0] + front[0] * (sd / 2 + 0.4) + right[0] * dx, y + sh * 0.31, p[2] + front[2] * (sd / 2 + 0.4) + right[2] * dx]
      mb.box(door[0], door[1], door[2], sw * 0.2, sh * 0.62, 0.8, yaw, SW_DOOR)
    }
    // No solar panels on any roof. The same random draws are still taken so every other prop stays where it was.
    if (q() < 0.4) {
      q(); q()
    }
    if (q() < 0.5) {
      // small low AC / ventilation units (up to about 1 m)
      const n = 1 + Math.floor(q() * 3)
      for (let k = 0; k < n; k++) {
        const sx = bayW * (0.5 + 0.4 * q()), sy = Math.min(100, bayH * (0.35 + 0.25 * q()))
        const p = at((q() - 0.5) * w * 0.7, (q() - 0.3) * 60, y + sy / 2)
        mb.box(p[0], p[1], p[2], sx, sy, sx * 0.8, yaw, SW_BLUEGREY, SW_WHITE)
      }
    }
    if (q() < 0.4) {
      // thin glass-like railing along the front roof edge (and sometimes one side), with a bright top rail
      const hh = bayH * 0.4
      const f = at(0, 133, y + hh / 2)
      mb.box(f[0], f[1], f[2], w * 0.96, hh, 1.2, yaw, SW_GLASS)
      mb.box(f[0], y + hh + 1, f[2], w * 0.96, 2, 2.4, yaw, SW_WHITE)
      if (q() < 0.5) {
        const sdp = at(side * (w * 0.5 - 2), 0, y + hh / 2)
        mb.box(sdp[0], sdp[1], sdp[2], 1.2, hh, 250, yaw, SW_GLASS)
        mb.box(sdp[0], y + hh + 1, sdp[2], 2.4, 2, 250, yaw, SW_WHITE)
      }
    }
    // Warning beacon on some roofs (deterministic hash of the building's position, no random numbers drawn, so nothing else shifts):
    // on the existing antenna if there is one, otherwise on its own thin 1-2 m pole.
    const hsh = Math.abs(Math.sin(a * 127.1 + d * 0.0311 + ri * 311.7) * 43758.5453) % 1
    if (hsh < 0.4) {
      if (!poleTop) {
        const ph = 100 + 100 * (hsh / 0.4)
        const p = on(y + ph / 2, ((hsh / 0.4) - 0.5) * w * 0.5)
        rb.box(p[0], p[1], p[2], 3, ph, 3, yaw, uvMetal)
        poleTop = [p[0], y + ph, p[2]]
      }
      this.beaconPts.push([poleTop[0], poleTop[1] + 6, poleTop[2]])
    }
  }

  /** A flat quad in the XZ plane facing up (UV 0..1). */
  private addPlane(parent: SceneObject, name: string, mat: Material, pos: vec3, sx: number, sz: number): SceneObject {
    if (!this.planeMesh) this.planeMesh = flatQuadMesh()
    const o = makeObj(parent, name)
    o.getTransform().setLocalPosition(pos)
    o.getTransform().setLocalScale(new vec3(sx, 1, sz))
    const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = this.planeMesh
    rmv.mainMaterial = mat
    rmv.setRenderOrder(ORDER_ROOF)
    return o
  }

  /**
   * The roof: 10 m x 10 m slab, a 25 cm ledge, a thin see-through railing, props off to the sides and behind. One merged mesh per material.
   */
  private buildRoof(kit: any, floorY: number, cam: vec3): void {
    this.roofRoot = makeObj(this.sceneObject, "Roof")
    this.roofRoot.getTransform().setWorldPosition(cam)
    const half = ROOF_HALF
    const H = ROOF_LEDGE
    const Z = [0, 0, 1, 1]
    const shadows: number[][] = [] // contact shadows [x, z, width, depth], baked into the slab texture (no transparent decals)

    const lit = (c: RGB, rough: number, metal: number, rim: number): MeshBatch => {
      const b = new MeshBatch()
      this.roofBatches.push({b, m: this.litMat(c, rough, metal, rim)})
      return b
    }
    // Light palette everywhere (the preview shows near-black as see-through): warm light concrete / stucco, painted metal, off-white units
    const wallB = lit([0.9, 0.86, 0.78], 0.92, 0, 0), copeB = lit([1.0, 0.9, 0.74], 0.92, 0, 1), hiB = lit([1.0, 0.98, 0.94], 0.92, 0, 1.4)
    const shadowB = lit([0.6, 0.52, 0.44], 0.92, 0, 0)
    const railB = lit([0.8, 0.83, 0.87], 0.32, 0.25, 0.3)
    const stairB = lit([0.85, 0.5, 0.38], 0.92, 0, 0.3), stairTopB = lit([1.0, 0.93, 0.8], 0.92, 0, 1), frameB = lit([0.95, 0.93, 0.88], 0.92, 0, 0.5)
    const doorB = lit([0.18, 0.5, 0.64], 0.45, 0.0, 0.6) // light painted warm metal, never dark
    const acB = lit([0.8, 0.82, 0.85], 0.38, 0.0, 0.3), edgeB = lit([1.0, 1.0, 1.0], 0.38, 0.0, 1.2)
    const tankB = lit([0.15, 0.55, 0.56], 0.38, 0.0, 0.5), bandB = lit([0.62, 0.65, 0.69], 0.38, 0.0, 0), legB = lit([0.68, 0.7, 0.73], 0.38, 0.0, 0)
    const pipeB = lit([0.8, 0.82, 0.85], 0.38, 0.0, 0.3), capB = lit([0.7, 0.74, 0.78], 0.38, 0.0, 0.6)
    // textured props (AC grille / fan top / louvers) share one small atlas
    const propsB = new MeshBatch()
    const propsMat = opaqueTexMat(propsAtlasTexture(0.65))
    this.lampBulbMat = opaqueUnlit(kit, [1.0, 0.82, 0.5])
    const bulbB = new MeshBatch()
    const indB = new MeshBatch()
    const indMat = opaqueUnlit(kit, [0.35, 1.0, 0.55])

    // Slab: generated concrete (grain, gravel, stains, a few uneven expansion joints, baked contact shadows), darker toward the edges
    const S = half * 2 + 60
    this.slabMat = this.litMat([1.0, 0.78, 0.58], 0.95, 0, 0) // texture assigned below, once the prop shadows are known
    this.slabMat.mainPass.twoSided = true
    this.addPlane(this.roofRoot, "Slab", this.slabMat, new vec3(0, floorY, 0), S, S)

    // Parapet: 110 cm with an 8 cm cap, all around (true size, measured from the floor)
    const L = half * 2 + 60
    const walls: [number, number, number, number][] = [[0, -half - 15, L, 30], [0, half + 15, L, 30], [-half - 15, 0, 30, L], [half + 15, 0, 30, L]]
    walls.forEach((w) => {
      const wide = w[2] > w[3]
      wallB.box(w[0], floorY + (H - 8) / 2, w[1], w[2], H - 8, w[3], 0, Z)
      shadowB.box(w[0], floorY + H - 8 - 4, w[1], w[2] + 2, 8, w[3] + 2, 0, Z) // darker shadow line under the cap
      copeB.box(w[0], floorY + H - 4, w[1], w[2] + (wide ? 0 : 8), 8, w[3] + (wide ? 8 : 0), 0, Z)
      const ix = wide ? 0 : -Math.sign(w[0]) * 9, iz = wide ? -Math.sign(w[1]) * 9 : 0
      hiB.box(w[0] + ix, floorY + H + 0.5, w[1] + iz, wide ? w[2] : 3, 1.5, wide ? 3 : w[3], 0, Z)
    })
    // thin see-through railing on the cap: slim posts about every 1.5 m up to 130 cm, one top rail
    const rb = floorY + H
    const rp = half + 15
    const side = half * 2, nSeg = Math.round(side / 150)
    const postH = floorY + ROOF_RAIL - rb
    for (let k = 0; k < nSeg; k++) {
      const t = -half + (side * k) / nSeg
      for (const [px, pz] of [[t, -rp], [rp, t], [-t, rp], [-rp, -t]]) railB.box(px, rb + postH / 2, pz, 4, postH, 4, 0, Z)
    }
    const ry = floorY + ROOF_RAIL - 2, rl = rp * 2 + 4
    railB.box(0, ry, -rp, rl, 4, 4, 0, Z)
    railB.box(0, ry, rp, rl, 4, 4, 0, Z)
    railB.box(-rp, ry, 0, 4, 4, rl, 0, Z)
    railB.box(rp, ry, 0, 4, 4, rl, 0, Z)

    const shade = (x: number, z: number, w: number, d: number) => { shadows.push([x, z, w, d]) }

    // Stairwell behind-left, 13.5 m out: 320 x 280 x 270 cm, flat roof with a 20 cm overhang, door 90 x 200 cm with frame and a handle at 100 cm
    const sx = -650, sz = 1180
    const SW = 320, SD = 280, SH = 270, RT = 16
    stairB.box(sx, floorY + (SH - RT) / 2, sz, SW, SH - RT, SD, 0, Z)
    stairTopB.box(sx, floorY + SH - RT / 2, sz, SW + 40, RT, SD + 40, 0, Z)
    const fz = sz - SD / 2 // face toward the middle of the roof
    const dx = sx + 70
    frameB.box(dx, floorY + 103, fz - 1.5, 106, 206, 3, 0, Z)
    doorB.box(dx, floorY + 100, fz - 4, 90, 200, 3, 0, Z)
    railB.box(dx + 34, floorY + 100, fz - 8, 5, 12, 6, 0, Z) // handle at 100 cm
    propsB.quad([sx - 80 + 40, floorY + 125, fz - 0.6], [sx - 80 - 40, floorY + 125, fz - 0.6], [sx - 80 - 40, floorY + 205, fz - 0.6], [sx - 80 + 40, floorY + 205, fz - 0.6], 0, 0, -1, PROPS_UV.louver)
    const lampPos = [dx, floorY + 235, fz - 6]
    railB.box(lampPos[0], lampPos[1] + 6, lampPos[2] + 5, 4, 4, 14, 0, Z)
    bulbB.box(lampPos[0], lampPos[1], lampPos[2], 14, 14, 14, 0, Z)
    shade(sx, sz - 30, SW + 100, SD + 80)

    // Three AC units (100 x 80 x 120 cm) at the sides and behind, 7.6-9.2 m out: fan top, front grille, edge highlights
    for (const [x, z] of [[-800, 100], [900, -200], [-300, 700]] as [number, number][]) {
      const fx = x < 0 ? 1 : -1 // the face that looks toward the middle of the roof
      acB.box(x, floorY + 60, z, 100, 120, 80, 0, Z)
      const ty = floorY + 120 + 1.4
      propsB.quad([x - 36, ty, z + 36], [x + 36, ty, z + 36], [x + 36, ty, z - 36], [x - 36, ty, z - 36], 0, 1, 0, PROPS_UV.fan)
      const gx = x + fx * 50.8, y0 = floorY + 12, y1 = floorY + 108
      if (fx > 0) propsB.quad([gx, y0, z + 34], [gx, y0, z - 34], [gx, y1, z - 34], [gx, y1, z + 34], 1, 0, 0, PROPS_UV.grille)
      else propsB.quad([gx, y0, z - 34], [gx, y0, z + 34], [gx, y1, z + 34], [gx, y1, z - 34], -1, 0, 0, PROPS_UV.grille)
      for (const [ex, ez, ew, ed] of [[0, 40, 102, 3], [0, -40, 102, 3], [50, 0, 3, 82], [-50, 0, 3, 82]]) edgeB.box(x + ex, floorY + 120.8, z + ez, ew, 1.8, ed, 0, Z)
      indB.box(x + fx * 51.5, floorY + 108, z + 26, 2, 4, 4, 0, Z) // power indicator
      shade(x, z, 170, 140)
    }

    // Water tank behind-right, 12.2 m out: 300 cm barrel (260 + 40 cone) on 250 cm legs = 550 cm, cross-braced, ladder with 30 cm rungs to the rim
    const tx = 700, tz = 1000
    const TR = 150, LEG = 250, BODY = 260
    const lg = [[-105, -105], [105, -105], [105, 105], [-105, 105]]
    for (const [lx, lz] of lg) legB.box(tx + lx, floorY + LEG / 2, tz + lz, 12, LEG, 12, 0, Z)
    tankB.prism(tx, floorY + LEG, tz, TR, BODY, 12, Z, 1)
    tankB.prism(tx, floorY + LEG - 4, tz, TR * 0.96, 4, 12, Z, 1)
    capB.prism(tx, floorY + LEG + BODY, tz, TR + 3, 40, 12, Z, 0)
    for (const by of [20, 130, 240]) bandB.prism(tx, floorY + LEG + by, tz, TR + 2, 8, 12, Z, 1)
    bandB.prism(tx, floorY + LEG + BODY - 4, tz, TR + 4, 8, 12, Z, 1)
    for (const rv of [60, 95, 170, 205]) bandB.prism(tx, floorY + LEG + rv, tz, TR + 0.8, 2, 12, Z, 1)
    for (let k = 0; k < 4; k++) {
      const a = lg[k], b = lg[(k + 1) % 4]
      for (const [y0, y1] of [[10, 120], [120, 238]]) {
        legB.cylinder([tx + a[0], floorY + y0, tz + a[1]], [tx + b[0], floorY + y1, tz + b[1]], 2.5, 6, Z)
        legB.cylinder([tx + b[0], floorY + y0, tz + b[1]], [tx + a[0], floorY + y1, tz + a[1]], 2.5, 6, Z)
      }
      legB.cylinder([tx + a[0], floorY + 120, tz + a[1]], [tx + b[0], floorY + 120, tz + b[1]], 2.5, 6, Z)
    }
    // ladder on the face toward the roof middle: rails slightly proud of the legs, rungs 30 cm apart, 45 cm wide, floor to the rim
    const lz = tz - TR - 2, lTop = LEG + BODY + 10
    for (const rx of [-22.5, 22.5]) legB.cylinder([tx + rx, floorY, lz], [tx + rx, floorY + lTop, lz], 2.5, 6, Z)
    for (let h = 30; h <= lTop - 10; h += 30) bandB.box(tx, floorY + h, lz, 45, 3.5, 3.5, 0, Z)
    for (const bh of [125, 245]) {
      legB.box(tx, floorY + bh, tz - 105, 210, 6, 6, 0, Z) // beam between the front legs
      bandB.box(tx, floorY + bh, (lz + tz - 111) / 2, 49, 3, 41, 0, Z) // standoff to the rails
    }
    for (const bh of [LEG + 60, LEG + 200]) bandB.box(tx, floorY + bh, tz - 148.5, 49, 3, 7, 0, Z)
    pipeB.cylinder([tx + 135, floorY + LEG, tz + 40], [tx + 135, floorY + 2, tz + 40], 6, 8, Z) // 12 cm drain pipe
    bulbB.box(tx + 120, floorY + 30, tz - 120, 10, 10, 10, 0, Z)
    shade(tx, tz, 360, 360)

    // Pipes, 11-14 cm: along the left parapet, along the back, one up the stairwell wall
    pipeB.cylinder([-1470, floorY + 7, -600], [-1470, floorY + 7, 700], 7, 8, Z)
    pipeB.cylinder([-1440, floorY + 6, -400], [-1440, floorY + 6, 500], 5.5, 8, Z)
    pipeB.cylinder([-300, floorY + 7, 1472], [900, floorY + 7, 1472], 7, 8, Z)
    pipeB.cylinder([sx - 170, floorY, fz - 8], [sx - 170, floorY + SH - RT, fz - 8], 6, 8, Z)
    shade(-1460, 50, 100, 1300)

    // build every merged mesh (one draw call each)
    for (const e of this.roofBatches) e.b.build(this.roofRoot, "RoofPart", e.m, ORDER_ROOF)
    propsB.build(this.roofRoot, "RoofProps", propsMat, ORDER_ROOF)
    bulbB.build(this.roofRoot, "LampBulb", this.lampBulbMat, ORDER_ROOF)
    indB.build(this.roofRoot, "Indicators", indMat, ORDER_ROOF)
    this.slabMat.mainPass.baseTex = slabTexture(1024, S, shadows)

    print("[Rooftop] camera world y=" + cam.y.toFixed(1) + " cm, roof floor world y=" + (cam.y + floorY).toFixed(1) + " cm, eye height above floor=" + (-floorY).toFixed(1) + " cm; parapet " + H + ", railing " + ROOF_RAIL + ", stairwell 270, tank 550, door 200, ladder to " + (260 + 250 + 10) + ", AC 120")
  }

  /** Time of Day lives on the sky script; found once by looking for its `timeOfDay` field under PreviewBackdrop. */
  private readTimeOfDay(): number {
    if (!this.todSource && ++this.searchFrame % 30 === 1) {
      const pb = findByName(null, "PreviewBackdrop")
      if (pb) {
        for (const c of pb.getComponents("Component.ScriptComponent")) {
          if (typeof (c as any).timeOfDay === "number") this.todSource = c
        }
      }
    }
    return this.todSource ? (this.todSource as any).timeOfDay : this.tod
  }

  /** Repaint everything that depends on Time of Day: the five atlases, the roof materials. Runs only when Time of Day changed, at most 10 times a second. */
  private apply(t: number): void {
    this.applied = t
    const w = timeWeights(t)
    this.light = smoothstep(0.3, 0.85, t)
    this.beaconLight = smoothstep(0.25, 0.7, t)
    if (this.skyline) this.skyline.setTimeOfDay(w, this.light)
    const horizon = mix3(HORIZON, w)
    const big = largeSurfaceFloor(w) // Day 0.65, Dusk 0.55, Night 0.45 for large flat surfaces
    // ambient colour taken from the sky: a gentle pull toward the horizon colour on top of the warm / cool tint
    const level = AMB_LEVEL[0] * w[0] + AMB_LEVEL[1] * w[1] + AMB_LEVEL[2] * w[2]
    const ambT = mix3(AMB_TINT, w)
    const amb = [0, 1, 2].map((k) => level * (ambT[k] * 0.7 + horizon[k] * 0.3))
    this.fts = ATLAS_HAZE.map((h) => facadeTimeFor(w, h, getTime())) // day: a touch brighter and more desaturated, hazier with distance; hues never change
    this.ft = this.fts[0]
    this.atlases.forEach((a, i) => paintAtlas(a, this.fts[i]))
    // roof: albedo * ambient plus a warm sunset rim on the lit edges at dusk, lifted so even the shaded faces stay above the big-surface floor
    // (lit faces show roughly 0.75 of their albedo)
    const rim = w[1] * 0.3
    const litFloor = big / 0.62
    for (const r of this.roofMats) {
      const moon = w[2] * 0.22 * r.rim // cool moonlight rim on the top edges at night
      const b = [r.c[0] * amb[0] + rim * r.rim + moon * 0.35, r.c[1] * amb[1] + rim * r.rim * 0.55 + moon * 0.6, r.c[2] * amb[2] + rim * r.rim * 0.2 + moon]
      // the slab fills the whole view when looking down and the grid still shows through anything under ~0.5 at night: it keeps the daytime floor
      const lc = minLuminance(b, r.m === this.slabMat ? 0.65 / 0.75 : litFloor)
      r.m.mainPass.baseColor = new vec4(Math.min(0.92, lc[0]), Math.min(0.92, lc[1]), Math.min(0.92, lc[2]), 1) // the roof is the lower-half reference look: no factor
    }
  }

  private update(): void {
    if (!this.showBackdrop) {
      if (this.built) this.sceneObject.getTransform().setLocalScale(vec3.zero())
      return
    }
    if (!this.built && this.sky.isBuilt()) this.build()
    if (!this.built) return
    if (this.skyline) this.skyline.follow(this.cameraObject.getTransform().getWorldPosition()) // the skyline stays centred on the viewer (horizontally)
    const now = getTime()
    if (now - this.lastSlow < 0.1) return // everything below runs at most 10 times a second
    this.lastSlow = now
    this.sceneObject.getTransform().setLocalScale(vec3.one())
    this.tod = this.readTimeOfDay()
    if (Math.abs(this.tod - this.applied) > 0.004) this.apply(this.tod)
    this.slowTick(now)
  }

  /** Slow effects at 10 Hz: beacon blink, lamp flicker, a few flickering windows (just two small rectangles per style, 2 styles per tick). */
  private slowTick(t: number): void {
    const phase = (t * 0.62) % 1
    const k = (phase < 0.16 ? 1 : 0.3) * (this.beaconLight > 0.05 ? 1 : 0)
    this.beaconMat.mainPass.baseColor = new vec4(k, 0.16 * k, 0.1 * k, 1)
    const lampL = this.beaconLight
    const lk = (0.55 + 0.45 * lampL) * (1 + 0.04 * Math.sin(t * 3.1) + 0.03 * Math.sin(t * 7.3))
    this.lampBulbMat.mainPass.baseColor = new vec4(Math.min(1, lk), Math.min(1, (0.82 - 0.1 * lampL) * lk), Math.min(1, 0.5 * lk), 1)
    if (this.ft && this.ft.frac > 0.02) {
      for (const f of this.fts) f.t = t
      for (let n = 0; n < 2; n++) {
        const style = this.flickerCursor
        this.flickerCursor = (this.flickerCursor + 1) % STYLES.length
        this.atlases.forEach((a, i) => paintFlicker(a, this.fts[i], style))
      }
    }
  }
}

/** Flat colour swatches (8 px cells) for the modern roof props: all bright enough for the additive display, none near-black. */
const SW_COLORS: RGB[] = [
  [0.74, 0.78, 0.82], // 0 light grey
  [0.96, 0.97, 1.0], // 1 white
  [0.56, 0.66, 0.8], // 2 soft blue-grey
  [0.4, 0.48, 0.62], // 3 door strip (darker blue-grey, still above the threshold)
  [0.22, 0.32, 0.62], // 4 solar panel (dark blue, lifted)
  [0.62, 0.8, 0.92] // 5 glass
]
const swUV = (i: number): number[] => [(i * 8 + 2) / 64, 2 / 8, (i * 8 + 6) / 64, 6 / 8]
const SW_GREY = swUV(0), SW_WHITE = swUV(1), SW_BLUEGREY = swUV(2), SW_DOOR = swUV(3), SW_GLASS = swUV(5)
function roofSwatchTexture(): Texture {
  const W = 64, H = 8
  const tex = ProceduralTextureProvider.createWithFormat(W, H, TextureFormat.RGBA8Unorm)
  const d = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = SW_COLORS[Math.min(SW_COLORS.length - 1, Math.floor(x / 8))]
      const o = (y * W + x) * 4
      d[o] = Math.round(255 * c[0]); d[o + 1] = Math.round(255 * c[1]); d[o + 2] = Math.round(255 * c[2]); d[o + 3] = 255
    }
  }
  ;(tex.control as ProceduralTextureProvider).setPixels(0, 0, W, H, d)
  return tex
}

/** Opaque unlit colour material: no blending, depth write and depth test on. */
function opaqueUnlit(kit: any, c: RGB): Material {
  const m = kit.uniqueUnlit(new vec4(c[0], c[1], c[2], 1))
  m.mainPass.blendMode = BlendMode.Disabled
  m.mainPass.depthWrite = true
  m.mainPass.depthTest = true
  return m
}

/** Opaque textured material (SH_SkyTex has the texture slot the kit's plain unlit material lacks). */
function opaqueTexMat(tex: Texture): Material {
  const m = TEX_MAT.clone()
  m.mainPass.baseTex = tex
  m.mainPass.baseColor = new vec4(1, 1, 1, 1)
  m.mainPass.blendMode = BlendMode.Disabled
  m.mainPass.depthWrite = true
  m.mainPass.depthTest = true
  m.mainPass.twoSided = false
  return m
}

function newMeshBuilder(): MeshBuilder {
  const b = new MeshBuilder([
    {name: "position", components: 3},
    {name: "normal", components: 3, normalized: true},
    {name: "texture0", components: 2}
  ])
  b.topology = MeshTopology.Triangles
  b.indexType = MeshIndexType.UInt16
  return b
}

/** Unit quad in the XZ plane, facing up, UV 0..1 (v = 0 at +z). */
function flatQuadMesh(): RenderMesh {
  const b = new MeshBuilder([
    {name: "position", components: 3},
    {name: "normal", components: 3, normalized: true},
    {name: "texture0", components: 2}
  ])
  b.topology = MeshTopology.Triangles
  b.indexType = MeshIndexType.UInt16
  b.appendVerticesInterleaved([
    -0.5, 0, -0.5, 0, 1, 0, 0, 1,
    0.5, 0, -0.5, 0, 1, 0, 1, 1,
    0.5, 0, 0.5, 0, 1, 0, 1, 0,
    -0.5, 0, 0.5, 0, 1, 0, 0, 0
  ])
  b.appendIndices([0, 2, 1, 0, 3, 2])
  b.updateMesh()
  return b.getMesh()
}

/** Concrete slab: irregular grain and gravel, soft stains, a few uneven expansion joints (no repeating grid), darker toward the edges. size = slab width in cm. */
function slabTexture(N: number, size: number, shadows: number[][]): Texture {
  const tex = ProceduralTextureProvider.createWithFormat(N, N, TextureFormat.RGBA8Unorm)
  const data = new Uint8Array(N * N * 4)
  let s = 99991
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  // a handful of stains (position, radius in cm, strength)
  const stains: number[][] = []
  for (let k = 0; k < 14; k++) stains.push([(rnd() - 0.5) * size * 0.9, (rnd() - 0.5) * size * 0.9, 25 + rnd() * 70, 0.06 + rnd() * 0.14])
  // a few expansion joints at uneven positions: [runs along z?, offset, phase]
  const joints: number[][] = [[1, -230 + rnd() * 60, rnd() * 6], [1, 80 + rnd() * 90, rnd() * 6], [1, 330 + rnd() * 40, rnd() * 6], [0, -150 + rnd() * 80, rnd() * 6], [0, 210 + rnd() * 70, rnd() * 6]]
  const half = ROOF_HALF
  let i = 0
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const cx = ((x + 0.5) / N - 0.5) * size, cz = (0.5 - (y + 0.5) / N) * size // texture row 0 is v 0, which is the +z edge of the plane
      let v = 0.56 + (rnd() - 0.5) * 0.07
      if (rnd() < 0.025) v += (rnd() - 0.5) * 0.28 // gravel specks
      for (const j of joints) {
        // an uneven, wandering joint that fades in and out along its length
        const along = j[0] ? cz : cx, across = j[0] ? cx : cz
        const off = across - (j[1] + 9 * Math.sin(along * 0.011 + j[2]) + 5 * Math.sin(along * 0.031 + j[2] * 2.3))
        if (Math.abs(off) < 2.2) v *= 1 - 0.12 * smoothstep(0.25, 0.7, 0.5 + 0.5 * Math.sin(along * 0.017 + j[2] * 3.1) * Math.sin(along * 0.0071 + j[2]))
      }
      for (const st of stains) {
        const d = Math.hypot(cx - st[0], cz - st[1]) / st[2]
        if (d < 1) v *= 1 - st[3] * (1 - d * d)
      }
      for (const sh of shadows) {
        // soft contact shadow under a prop: [x, z, width, depth], darkest in the middle, fading out past the footprint
        const d = Math.hypot((cx - sh[0]) / (sh[2] * 0.5), (cz - sh[1]) / (sh[3] * 0.5))
        if (d < 1.3) v *= 1 - 0.45 * (1 - smoothstep(0.5, 1.3, d))
      }
      const e = Math.max(Math.abs(cx), Math.abs(cz))
      v *= 1 - 0.3 * smoothstep(half - 130, half, e) // darker near the parapet
      v *= 0.96 + 0.06 * Math.sin(cx * 0.013 + cz * 0.009) + 0.03 * Math.sin(cx * 0.041 - cz * 0.033)
      const c = Math.max(0, Math.min(1, v))
      data[i++] = Math.round(c * 250); data[i++] = Math.round(c * 247); data[i++] = Math.round(c * 244)
      data[i++] = 255
    }
  }
  ;(tex.control as ProceduralTextureProvider).setPixels(0, 0, N, N, data)
  return tex
}

function findByName(parent: SceneObject | null, name: string): SceneObject | null {
  const n = parent ? parent.getChildrenCount() : global.scene.getRootObjectsCount()
  for (let i = 0; i < n; i++) {
    const c = parent ? parent.getChild(i) : global.scene.getRootObject(i)
    if (c.name === name) return c
    const deep = findByName(c, name)
    if (deep) return deep
  }
  return null
}

/** Weights for [day, dusk, night]: smoothly 0 -> 0.5 -> 1 (same curve as the sky script). */
function timeWeights(t: number): number[] {
  const c = Math.max(0, Math.min(1, t))
  if (c <= 0.5) {
    const k = smoothstep(0, 1, c / 0.5)
    return [1 - k, k, 0]
  }
  const k = smoothstep(0, 1, (c - 0.5) / 0.5)
  return [0, 1 - k, k]
}

function mix3(c: RGB[], w: number[]): RGB {
  return [c[0][0] * w[0] + c[1][0] * w[1] + c[2][0] * w[2], c[0][1] * w[0] + c[1][1] * w[1] + c[2][1] * w[2], c[0][2] * w[0] + c[1][2] * w[1] + c[2][2] * w[2]]
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

