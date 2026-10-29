// SkyHangarRooftopBackdrop.ts
// Owns: the PREVIEW-ONLY atmosphere (round 1 #8) — the user stands on a city rooftop terrace at dusk:
// a gradient dusk sky dome, a few soft clouds, a skyline of simple buildings around the horizon with
// distant warm lights, a terrace floor and a parapet at 110 cm (gives a sense of scale).
// Lives under its own root "PreviewBackdrop_Rooftop", separate from the Lens UI; switch it off by
// disabling that root (or untick showBackdrop) before publishing — on Specs the real world is the backdrop.
// Kept light on triangles (~3k). The dome and skyline follow the head POSITION only (they are "at infinity");
// the floor and parapet stay where the user started.
// Expects @inputs: camera object, sky controller (primitive kit). Must not: interact or show UI.

import {SkyHangarSkyController} from "./SkyHangarSkyController"
import {makeObj} from "./SkyHangarUtil"
import {sphereBandMesh} from "./SkyHangarMeshes"

const DEG = Math.PI / 180

const BACKDROP_RENDER_ORDER = -100

@component
export class SkyHangarRooftopBackdrop extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarRooftopBackdrop – preview-only dusk rooftop</span>')
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
  @hint("Eye height above the terrace floor, cm")
  @widget(new SliderWidget(120, 200, 1))
  eyeHeightCm: number = 160
  @input
  @hint("Parapet height above the floor, cm")
  @widget(new SliderWidget(60, 150, 1))
  parapetHeightCm: number = 110
  @input
  @hint("Half size of the square terrace (parapet distance from the user), cm")
  @widget(new SliderWidget(120, 600, 10))
  terraceHalfCm: number = 280
  @ui.group_end

  private farRoot!: SceneObject
  private clouds!: SceneObject
  private windowMats: Material[] = []
  private beaconMats: Material[] = []
  private cars: {obj: SceneObject; az: number; el: number; speed: number; d: number}[] = []
  private built = false

  onAwake(): void {
    if (!this.cameraObject || !this.sky) {
      print("SkyHangarRooftopBackdrop: required @input not wired")
      return
    }
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  isBuilt(): boolean { return this.built }

  private build(): void {
    const kit = this.sky.partKit
    if (!kit) return
    const cam = this.cameraObject.getTransform().getWorldPosition()
    this.sceneObject.getTransform().setWorldPosition(cam)
    this.sceneObject.getTransform().setWorldRotation(quat.quatIdentity())
    const floorY = -this.eyeHeightCm

    // --- Far layer (follows head position): smooth gradient dome, clouds, layered skyline, beacons, traffic
    this.farRoot = makeObj(this.sceneObject, "FarLayer")
    const R = 6000
    const dome = makeObj(this.farRoot, "DuskSkyDome")
    // Banding fix: bands are cut wherever the colour has changed by ~1.8/255, so every step is below what the eye
    // (and an 8-bit display) can resolve; flat per-band colour means the few radial facets never show.
    const cuts: number[] = [-90]
    let prev = duskColor(-90)
    let acc = 0
    for (let d = -5.95; d < 90; d += 0.05) {
      const c = duskColor(d)
      acc += Math.max(Math.abs(c.x - prev.x), Math.abs(c.y - prev.y), Math.abs(c.z - prev.z)) * 255
      prev = c
      if (acc >= 1.8) { cuts.push(d); acc = 0 }
    }
    cuts.push(90)
    for (let i = 0; i < cuts.length - 1; i++) {
      const mat = kit.uniqueUnlit(duskColor((cuts[i] + cuts[i + 1]) / 2))
      mat.mainPass.twoSided = true
      const band = makeObj(dome, "SkyBand_" + i)
      band.getTransform().setLocalScale(new vec3(R, R, R))
      const rmv = band.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
      rmv.mesh = sphereBandMesh("dusk" + i, cuts[i] * DEG, cuts[i + 1] * DEG + 0.002, 8)
      rmv.mainMaterial = mat
    }
    // Clouds: a few faint, soft flattened ellipsoids that drift slowly
    const cloudMat = kit.uniqueUnlit(new vec4(1.0, 0.82, 0.8, 0.24))
    this.clouds = makeObj(this.farRoot, "Clouds")
    const cloudAz = [30, 110, 195, 265, 330]
    for (let i = 0; i < cloudAz.length; i++) {
      const a = cloudAz[i] * DEG
      const el = (9 + (i % 3) * 6) * DEG
      const d = 4600
      const p = new vec3(Math.sin(a) * Math.cos(el) * d, Math.sin(el) * d, -Math.cos(a) * Math.cos(el) * d)
      kit.part(this.clouds, "Cloud_" + i, kit.sphere, cloudMat, p, new vec3(1100 + (i % 2) * 500, 110, 380), quat.angleAxis(-a, vec3.up()))
    }

    // Skyline in three depths: far haze (pale, low contrast), mid, near (darkest). Windows only on mid/near.
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const city = makeObj(this.farRoot, "Skyline")
    for (let g = 0; g < 5; g++) this.windowMats.push(kit.uniqueUnlit(new vec4(1.0, 0.84, 0.55, 0.6)))
    for (let g = 0; g < 3; g++) this.beaconMats.push(kit.uniqueUnlit(new vec4(1.0, 0.16, 0.1, 1)))
    // Traffic sits between the far and mid layers, so nearer buildings hide it (it only shows in gaps)
    const addTraffic = () => {
          const carWhite = kit.uniqueUnlit(new vec4(1.0, 0.93, 0.75, 0.85))
      const carRed = kit.uniqueUnlit(new vec4(1.0, 0.2, 0.15, 0.7))
      const traffic = makeObj(city, "Traffic")
      for (let i = 0; i < 8; i++) {
        const el = (-1.9 + (i % 4) * 0.55) * DEG
        const dir = i % 2 === 0 ? 1 : -1
        const obj = kit.part(traffic, "Car_" + i, kit.box, dir > 0 ? carWhite : carRed, vec3.zero(), new vec3(44, 6, 6))
        this.cars.push({obj, az: rnd() * Math.PI * 2, el, speed: dir * (0.5 + rnd() * 0.9) * DEG, d: 3300})
      }
    }
    const towers: {a: number; d: number; top: number; layer: number}[] = []
    const layers = [
      {name: "Far", count: 130, dist: 5200, lo: 0.8, hi: 3.4, hazeMix: 0.4, body: new vec4(0.46, 0.34, 0.56, 1), windows: 0},
      {name: "Mid", count: 96, dist: 3800, lo: 1.2, hi: 4.8, hazeMix: 0.1, body: new vec4(0.32, 0.25, 0.48, 1), windows: 2},
      {name: "Near", count: 60, dist: 2600, lo: 1.8, hi: 6.5, hazeMix: 0, body: new vec4(0.21, 0.17, 0.38, 1), windows: 3}
    ]
    const base = floorY - 3000
    layers.forEach((L, li) => {
      const root = makeObj(city, "Skyline" + L.name)
      const hazeCol = duskColor(2)
      const body = lerp4(L.body, new vec4(hazeCol.x * 0.7, hazeCol.y * 0.55, hazeCol.z * 0.8, 1), L.hazeMix)
      const bodyMat = kit.mat(body, false)
      const bodyMat2 = kit.mat(lerp4(body, new vec4(0.05, 0.05, 0.14, 1), 0.2), false)
      for (let i = 0; i < L.count; i++) {
        const a = (i / L.count) * Math.PI * 2 + (rnd() - 0.5) * 0.04
        const d = L.dist * (0.97 + rnd() * 0.06)
        const topEl = (L.lo + Math.pow(rnd(), 1.6) * (L.hi - L.lo)) * DEG
        const top = Math.tan(topEl) * d
        const h = top - base
        const w = ((Math.PI * 2 * d) / L.count) * (0.5 + rnd() * 0.3)
        const p = new vec3(Math.sin(a) * d, base + h / 2, -Math.cos(a) * d)
        const b = kit.part(root, "B_" + i, kit.box, i % 3 === 0 ? bodyMat2 : bodyMat, p, new vec3(w, h, 400), quat.angleAxis(-a, vec3.up()))
        if (L.windows > 0) {
          const nw = Math.floor(rnd() * (L.windows + 1))
          for (let j = 0; j < nw; j++) {
            const ly = h / 2 - 60 - rnd() * Math.min(420, h * 0.4)
            const lx = (rnd() - 0.5) * w * 0.7
            const g = Math.floor(rnd() * this.windowMats.length)
            kit.part(b, "W_" + j, kit.box, this.windowMats[g], new vec3(lx, ly, 205), new vec3(li === 1 ? 36 : 26, li === 1 ? 24 : 18, 4))
          }
        }
        if (li > 0) towers.push({a, d, top, layer: li})
      }
      if (li === 0) addTraffic()
    })
    // Red aircraft beacons on the tallest towers, blinking out of step
    towers.sort((x, y) => y.top / y.d - x.top / x.d)
    for (let i = 0; i < 9 && i < towers.length; i++) {
      const t = towers[i]
      const p = new vec3(Math.sin(t.a) * (t.d - 150), t.top + 30, -Math.cos(t.a) * (t.d - 150))
      kit.part(city, "Beacon_" + i, kit.box, this.beaconMats[i % this.beaconMats.length], p, new vec3(26, 26, 26))
    }

    // No terrace floor or parapet: a grey box around the user hid the dome and swallowed the UI. The dome now
    // covers the full sphere (down to -90 deg) and every backdrop material skips depth writes, so UI always draws in front.
    // Render the whole backdrop behind everything else (radar, hangar, cards, markers): hierarchy order alone
    // is not enough for the transparent sky dome, which otherwise paints over the radar disc.
    this.setBackdropOrder(this.farRoot, BACKDROP_RENDER_ORDER)
    // The dome bands sit at the head (their object origin is distance 0), so transparent sorting would draw them
    // last and paint over the skyline: send them one step further back.
    this.setBackdropOrder(dome, BACKDROP_RENDER_ORDER - 100)
    this.built = true
  }

  private setBackdropOrder(root: SceneObject, order: number): void {
    const rmv = root.getComponent("Component.RenderMeshVisual") as RenderMeshVisual | null
    if (rmv) {
      rmv.renderOrder = order
      rmv.mainMaterial.mainPass.depthWrite = false
    }
    for (let i = 0; i < root.getChildrenCount(); i++) this.setBackdropOrder(root.getChild(i), order)
  }

  private update(): void {
    if (!this.showBackdrop) {
      if (this.built) this.sceneObject.getTransform().setLocalScale(vec3.zero())
      return
    }
    if (!this.built && this.sky.isBuilt()) this.build()
    if (this.built) this.sceneObject.getTransform().setLocalScale(vec3.one())
    if (this.built) {
      this.farRoot.getTransform().setWorldPosition(this.cameraObject.getTransform().getWorldPosition())
      this.animate()
    }
  }

  /** Calm life: windows flicker slowly, beacons blink out of step, cars crawl, clouds drift. */
  private animate(): void {
    const t = getTime()
    for (let i = 0; i < this.windowMats.length; i++) {
      const a = 0.52 + 0.28 * Math.sin(t * 0.45 + i * 1.7) + 0.12 * Math.sin(t * 1.3 + i * 4.1)
      this.windowMats[i].mainPass.baseColor = new vec4(1.0, 0.84, 0.55, Math.max(0.12, Math.min(0.95, a)))
    }
    for (let i = 0; i < this.beaconMats.length; i++) {
      const phase = (t * 0.62 + i * 0.37) % 1
      this.beaconMats[i].mainPass.baseColor = new vec4(1.0, 0.16, 0.1, phase < 0.16 ? 1 : 0.07)
    }
    for (const c of this.cars) {
      c.az += c.speed * getDeltaTime()
      const p = new vec3(Math.sin(c.az) * Math.cos(c.el) * c.d, Math.sin(c.el) * c.d, -Math.cos(c.az) * Math.cos(c.el) * c.d)
      const tr = c.obj.getTransform()
      tr.setLocalPosition(p)
      tr.setLocalRotation(quat.angleAxis(-c.az, vec3.up()))
    }
    this.clouds.getTransform().setLocalRotation(quat.angleAxis(t * 0.6 * DEG, vec3.up()))
  }
}

/** Dusk gradient by elevation (degrees): orange glow at the horizon -> violet -> navy at the zenith. */
function duskColor(deg: number): vec4 {
  const stops: [number, vec4][] = [
    [-6, new vec4(0.95, 0.42, 0.18, 1)],
    [0, new vec4(1.0, 0.55, 0.24, 1)],
    [7, new vec4(0.92, 0.4, 0.4, 1)],
    [20, new vec4(0.55, 0.3, 0.6, 1)],
    [45, new vec4(0.2, 0.18, 0.46, 1)],
    [90, new vec4(0.07, 0.1, 0.3, 1)]
  ]
  for (let i = 1; i < stops.length; i++) {
    if (deg <= stops[i][0]) {
      const t = (deg - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0])
      return lerp4(stops[i - 1][1], stops[i][1], t * t * (3 - 2 * t))
    }
  }
  return stops[stops.length - 1][1]
}

function lerp4(a: vec4, b: vec4, t: number): vec4 {
  const u = Math.max(0, Math.min(1, t))
  return new vec4(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u, a.w + (b.w - a.w) * u)
}
