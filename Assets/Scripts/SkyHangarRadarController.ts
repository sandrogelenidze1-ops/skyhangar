// SkyHangarRadarController.ts
// Owns: the tower-style radar — a flat disc ~40 cm wide, ~1 m ahead, a little below eye level,
// tilted ~45 deg toward the user like a tablet. User at the centre, range rings, a rotating sweep
// line, and one pinchable blip per aircraft (heading-up: the direction you faced when opening it is up).
// Expects @inputs: camera object, sky controller (PartKit + data). Emits onBlipTap(info).
// Must not: render text or open the info card itself.

import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {SkyObjectInfo} from "./SkyHangarFlightData"
import {SkyHangarSkyController} from "./SkyHangarSkyController"
import {makeObj, yawOf, yawOffset, yawRotation, DEG} from "./SkyHangarUtil"
import {buildGlyph, BuiltGlyph, setGlyphBrightness, spinGlyphRotor} from "./SkyHangarGlyphs"

interface Blip {
  info: SkyObjectInfo
  obj: SceneObject
  glyph: BuiltGlyph
  visual: SceneObject
  angle: number // radians, radar-local (0 = up/forward)
  base: vec4
  hovered: boolean
}

@component
export class SkyHangarRadarController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarRadarController – tilted radar disc</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("The main camera SceneObject")
  cameraObject!: SceneObject
  @input
  @hint("Sky controller — provides the shared primitive kit and marker colours")
  sky!: SkyHangarSkyController
  @input
  @hint("Tilted child that holds the disc content")
  discRoot!: SceneObject
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input("vec3", "{0, -2, -100}")
  @hint("Disc centre relative to the eyes when opened (x right, y up, -z ahead), cm")
  openOffset: vec3 = new vec3(0, -2, -100)
  @input
  @hint("Disc diameter, cm")
  @widget(new SliderWidget(20, 70, 1))
  diameterCm: number = 40
  @input
  @hint("Tilt toward the user, degrees (0 = flat table, 90 = upright)")
  @widget(new SliderWidget(0, 90, 1))
  tiltDeg: number = 45
  @input
  @hint("Radar range at the rim, km")
  @widget(new SliderWidget(10, 150, 1))
  rangeKm: number = 70
  @input
  @hint("Sweep rotation, seconds per revolution")
  @widget(new SliderWidget(1, 10, 0.5))
  sweepSeconds: number = 4
  @input
  @hint("Include satellites as blips (they are not really on a tower radar)")
  includeSatellites: boolean = false
  @input("vec4", "{0.35, 0.95, 0.6, 1.0}")
  @hint("Ring and sweep colour")
  @widget(new ColorWidget())
  radarColor: vec4 = new vec4(0.35, 0.95, 0.6, 1.0)
  @input
  @hint("While an info card is open over the radar, the disc slides down by this much, cm")
  @widget(new SliderWidget(0, 60, 1))
  dockDropCm: number = 26
  @input
  @hint("...and shrinks to this scale")
  @widget(new SliderWidget(0.3, 1, 0.05))
  dockScale: number = 0.6
  @input
  @hint("...and dims to this opacity")
  @widget(new SliderWidget(0.1, 1, 0.05))
  dockOpacity: number = 0.45
  @ui.group_end

  private blips: Blip[] = []
  private sweep!: SceneObject
  private sweepAngle = 0
  private built = false
  private yawAtOpen = 0
  private sweepMats: Material[] = []
  private dock = 0 // 0 = normal place, 1 = docked under the card
  private dockTarget = 0
  private lastDim = 1
  private discBasePos = vec3.zero()
  private dimMats: {m: Material; a: number}[] = []
  private _onBlipTap = new Event<SkyObjectInfo>()
  get onBlipTap(): PublicApi<SkyObjectInfo> { return this._onBlipTap.publicApi() }

  onAwake(): void {
    if (!this.cameraObject || !this.sky || !this.discRoot) {
      print("SkyHangarRadarController: required @input not wired")
      return
    }
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  getBlipCount(): number { return this.blips.length }
  getBlipObject(id: string): SceneObject | null { return this.blips.find((b) => b.info.id === id)?.obj ?? null }
  getBlipIds(): string[] { return this.blips.map((b) => b.info.id) }
  /** World positions + text of the range-ring labels (drawn by the labels UI in the shared type scale). */
  getRangeLabels(): {pos: vec3; text: string}[] {
    if (!this.built) return []
    const R = this.diameterCm / 2
    const t = this.discRoot.getTransform()
    const out: {pos: vec3; text: string}[] = []
    for (const frac of [1 / 3, 2 / 3, 1]) {
      out.push({pos: t.getWorldTransform().multiplyPoint(new vec3(R * frac * 0.72 + 1.2, 0.6, -R * frac * 0.69)), text: Math.round(this.rangeKm * frac) + " km"})
    }
    out.push({pos: t.getWorldTransform().multiplyPoint(new vec3(0, 0.6, -R - 3.2)), text: "AHEAD"})
    return out
  }
  /** Slide down / shrink / dim under an open info card (true), or return to the normal place and full opacity (false). */
  setDocked(on: boolean): void { this.dockTarget = on ? 1 : 0 }
  /** Current opacity factor of the radar (1 = normal, dockOpacity = fully docked). */
  getDim(): number { return 1 + (this.dockOpacity - 1) * this.dock }
  isOpen(): boolean { return this.built && this.sceneObject.getTransform().getLocalScale().x > 0.01 }
  /** Test hook: act as if the blip was pinched. */
  simulateBlipTap(id: string): boolean {
    const b = this.blips.find((x) => x.info.id === id)
    if (!b) return false
    this._onBlipTap.invoke(b.info)
    return true
  }

  /** Place in front of the user and (lazily) build. */
  openInFront(): void {
    const t = this.cameraObject.getTransform()
    const yaw = yawOf(t.getWorldRotation().multiplyVec3(new vec3(0, 0, -1)))
    this.yawAtOpen = yaw
    this.sceneObject.getTransform().setWorldPosition(yawOffset(t.getWorldPosition(), yaw, this.openOffset))
    this.sceneObject.getTransform().setWorldRotation(yawRotation(yaw))
    this.discRoot.getTransform().setLocalRotation(quat.angleAxis(this.tiltDeg * DEG, vec3.right()))
    if (!this.built) this.build()
    this.layoutBlips()
  }

  /** Glass style (round 1 #14): pale cool glass face with a bright rim, thin rings, soft sweep, glyph blips. */
  private build(): void {
    const kit = this.sky.partKit
    if (!kit) return
    const R = this.diameterCm / 2
    const c = this.radarColor
    kit.part(this.discRoot, "RadarFace", kit.cylinder, kit.uniqueUnlit(new vec4(0.62, 0.74, 0.88, 0.22)), new vec3(0, -0.4, 0), new vec3(R * 2, 0.3, R * 2))
    kit.part(this.discRoot, "RadarFaceGlow", kit.cylinder, kit.uniqueUnlit(new vec4(0.85, 0.92, 1.0, 0.1)), new vec3(0, -0.2, 0), new vec3(R * 1.2, 0.1, R * 1.2))
    this.buildRing(kit.uniqueUnlit(new vec4(0.9, 0.95, 1.0, 0.85)), R, 0.22)
    const ringMat = kit.uniqueUnlit(new vec4(c.x, c.y, c.z, 0.45))
    for (const frac of [1 / 3, 2 / 3]) this.buildRing(ringMat, R * frac, 0.1)
    const cross = kit.uniqueUnlit(new vec4(0.85, 0.92, 1.0, 0.18))
    kit.part(this.discRoot, "CrossNS", kit.box, cross, new vec3(0, 0.05, 0), new vec3(0.08, 0.06, R * 2))
    kit.part(this.discRoot, "CrossEW", kit.box, cross, new vec3(0, 0.05, 0), new vec3(R * 2, 0.06, 0.08))
    // Heading-up marker at the top of the rim (accent)
    kit.part(this.discRoot, "UpMarker", kit.cone, kit.uniqueUnlit(new vec4(0.55, 0.78, 1.0, 0.95)), new vec3(0, 0.3, -R - 1.2), new vec3(1.3, 1.3, 0.4), quat.angleAxis(-Math.PI / 2, vec3.right()))
    kit.part(this.discRoot, "You", kit.sphere, kit.uniqueUnlit(new vec4(1, 1, 1, 1)), new vec3(0, 0.4, 0), new vec3(1.1, 0.6, 1.1))
    // Soft sweep: a thin bright line plus a fading trailing wedge
    this.sweep = makeObj(this.discRoot, "SweepLine")
    kit.part(this.sweep, "Sweep", kit.box, kit.uniqueUnlit(new vec4(c.x, c.y, c.z, 0.9)), new vec3(0, 0.2, -R / 2), new vec3(0.14, 0.08, R))
    for (let i = 1; i <= 8; i++) {
      const m = kit.uniqueUnlit(new vec4(c.x, c.y, c.z, 0.16 * (1 - i / 9)))
      this.sweepMats.push(m)
      const piv = makeObj(this.sweep, "SweepTrail_" + i)
      piv.getTransform().setLocalRotation(quat.angleAxis(i * 0.07, vec3.up()))
      kit.part(piv, "Wedge", kit.box, m, new vec3(0, 0.15, -R / 2), new vec3(R * 0.075, 0.05, R))
    }
    // Blips: the same flat glyphs and colours as the sky, lying on the disc (nose = heading)
    const blipRoot = makeObj(this.discRoot, "Blips")
    for (const info of this.sky.getInfos()) {
      if (info.kind === "satellite" && !this.includeSatellites) continue
      const obj = makeObj(blipRoot, "RadarBlip_" + info.id)
      const col = obj.createComponent("Physics.ColliderComponent") as ColliderComponent
      const sh = Shape.createSphereShape()
      sh.radius = 2.4
      col.shape = sh
      col.fitVisual = false
      const it = obj.createComponent(Interactable.getTypeName()) as Interactable
      const base = this.sky.getMarkerColor(info.kind)
      const visual = makeObj(obj, "BlipVisual")
      visual.getTransform().setLocalPosition(new vec3(0, 0.5, 0))
      const glyph = buildGlyph(this.sky.partKit, visual, "Glyph", info.kind, info.kind === "satellite" ? 2.0 : 2.4, base)
      const b: Blip = {info, obj, glyph, visual, angle: 0, base, hovered: false}
      it.onHoverEnter.add(() => (b.hovered = true))
      it.onHoverExit.add(() => (b.hovered = false))
      it.onTriggerEnd.add(() => this._onBlipTap.invoke(info))
      this.blips.push(b)
    }
    this.discBasePos = this.discRoot.getTransform().getLocalPosition()
    this.collectDimMats(this.discRoot)
    this.built = true
  }

  /** Every non-blip material of the disc with its own alpha, so the whole radar can be dimmed together. */
  private collectDimMats(root: SceneObject): void {
    if (root.name === "Blips") return
    const rmv = root.getComponent("Component.RenderMeshVisual") as RenderMeshVisual | null
    if (rmv && rmv.mainMaterial && !this.dimMats.some((d) => d.m === rmv.mainMaterial)) this.dimMats.push({m: rmv.mainMaterial, a: rmv.mainMaterial.mainPass.baseColor.w})
    for (let i = 0; i < root.getChildrenCount(); i++) this.collectDimMats(root.getChild(i))
  }

  private buildRing(mat: Material, r: number, w: number): void {
    const kit = this.sky.partKit
    const n = Math.max(24, Math.floor(r * 3))
    const ring = makeObj(this.discRoot, "RangeRing_" + Math.round(r))
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const p = new vec3(Math.sin(a) * r, 0.1, -Math.cos(a) * r)
      kit.part(ring, "Seg_" + i, kit.box, mat, p, new vec3(((Math.PI * 2 * r) / n) * 1.02, 0.12, w), quat.angleAxis(-a, vec3.up()))
    }
  }

  /** Blip position: real azimuth relative to the facing direction at open time, ground distance scaled. */
  private layoutBlips(): void {
    const R = this.diameterCm / 2
    for (const b of this.blips) {
      const rel = b.info.azimuthDeg * DEG - this.yawAtOpen
      b.angle = rel
      const frac = Math.min(0.97, b.info.kind === "satellite" ? 0.95 : b.info.distanceKm / this.rangeKm)
      b.obj.getTransform().setLocalPosition(new vec3(Math.sin(rel) * R * frac, 0, -Math.cos(rel) * R * frac))
      // Glyph lies flat (faces +Y), nose along the heading relative to the radar's up direction.
      const hdg = b.info.trackDeg * DEG - this.yawAtOpen
      b.visual.getTransform().setLocalRotation(quat.angleAxis(-hdg, vec3.up()).multiply(quat.angleAxis(-Math.PI / 2, vec3.right())))
    }
  }

  private update(): void {
    if (!this.built || !this.sceneObject.enabled) return
    const dt = getDeltaTime()
    if (this.dock !== this.dockTarget) {
      this.dock += (this.dockTarget - this.dock) * Math.min(1, dt * 7)
      if (Math.abs(this.dock - this.dockTarget) < 0.003) this.dock = this.dockTarget
      const e = this.dock * this.dock * (3 - 2 * this.dock)
      const t = this.discRoot.getTransform()
      t.setLocalPosition(this.discBasePos.add(new vec3(0, -this.dockDropCm * e, 0)))
      const sc = 1 + (this.dockScale - 1) * e
      t.setLocalScale(new vec3(sc, sc, sc))
    }
    const dim = this.getDim()
    if (dim !== this.lastDim) {
      this.lastDim = dim
      for (const d of this.dimMats) {
        const c = d.m.mainPass.baseColor
        d.m.mainPass.baseColor = new vec4(c.x, c.y, c.z, d.a * dim)
      }
    }
    this.sweepAngle = (this.sweepAngle + (dt / this.sweepSeconds) * Math.PI * 2) % (Math.PI * 2)
    this.sweep.getTransform().setLocalRotation(quat.angleAxis(-this.sweepAngle, vec3.up()))
    for (const b of this.blips) {
      // Brighten as the sweep passes, then decay
      let a = ((this.sweepAngle - (((b.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2))) + Math.PI * 2) % (Math.PI * 2)
      const glow = Math.max(0, 1 - a / 2.2)
      const k = b.hovered ? 1 : 0.25 + 0.75 * glow
      b.obj.getTransform().setLocalScale(b.hovered ? new vec3(1.5, 1.5, 1.5) : vec3.one())
      setGlyphBrightness(b.glyph, b.base, k)
      if (dim < 0.999) {
        for (const m of b.glyph.materials) {
          const c = m.mainPass.baseColor
          m.mainPass.baseColor = new vec4(c.x, c.y, c.z, c.w * dim)
        }
      }
      if (b.info.kind === "helicopter") spinGlyphRotor(b.glyph, dt, 0.8)
    }
  }
}
