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
import {PartKit, makeObj, yawOf, yawOffset, yawRotation, DEG} from "./SkyHangarUtil"
import {buildGlyph, BuiltGlyph, setGlyphBrightness, spinGlyphRotor} from "./SkyHangarGlyphs"
import {latheMesh, ringMesh, MESH_BOUNDS} from "./SkyHangarMeshes"

const RING_MIN_SEGMENTS = 96 // smooth circles
const KT_TO_KM_S = 1.852 / 3600
const TRAIL_LEN_FRAC = 0.14 // contrail length as a fraction of the radar radius, before the speed factor
const TRAIL_HEAD_W = 0.2 // ribbon width at the icon / at the tail, cm
const TRAIL_TAIL_W = 0.08
const TRAIL_HEAD_ALPHA = 0.8
const TRAIL_Y = 0.45
const TRAIL_STRIDE = 12 // position 3 + normal 3 + uv 2 + colour 4

interface Blip {
  info: SkyObjectInfo
  obj: SceneObject
  glyph: BuiltGlyph
  visual: SceneObject
  angle: number // radians, radar-local (0 = up/forward)
  eastKm: number // position relative to the user, km (moves at the real ground speed along the real heading)
  northKm: number
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
  private trailBuilder: MeshBuilder | null = null
  private trailData: number[] = []
  private trailFailed = false
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

  /** Frosted-glass style: neutral frosted face with a white rim, thin white rings, soft sweep, glyph blips. */
  private build(): void {
    const kit = this.sky.partKit
    if (!kit) return
    const R = this.diameterCm / 2
    const c = this.radarColor
    // Discs from a 96-segment lathe (the shared cylinder is coarse): the face and its glow are round, not faceted.
    const disc = latheMesh("radar_disc", [[-0.5, 1, 0], [0.5, 1, 0]], RING_MIN_SEGMENTS)
    const flat = quat.angleAxis(Math.PI / 2, vec3.right()) // the lathe axis is Z; lay it down so its axis is up
    kit.part(this.discRoot, "RadarFace", disc, kit.uniqueUnlit(new vec4(0.82, 0.85, 0.9, 0.22)), new vec3(0, -0.4, 0), new vec3(R * 2, R * 2, 0.3), flat)
    kit.part(this.discRoot, "RadarFaceGlow", disc, kit.uniqueUnlit(new vec4(1, 1, 1, 0.08)), new vec3(0, -0.2, 0), new vec3(R * 1.2, R * 1.2, 0.1), flat)
    this.buildRing(kit.uniqueUnlit(new vec4(1, 1, 1, 0.7)), R, 0.22)
    const ringMat = kit.uniqueUnlit(new vec4(1, 1, 1, 0.4))
    for (const frac of [1 / 3, 2 / 3]) this.buildRing(ringMat, R * frac, 0.1)
    const cross = kit.uniqueUnlit(new vec4(1, 1, 1, 0.16))
    kit.part(this.discRoot, "CrossNS", kit.box, cross, new vec3(0, 0.05, 0), new vec3(0.08, 0.06, R * 2))
    kit.part(this.discRoot, "CrossEW", kit.box, cross, new vec3(0, 0.05, 0), new vec3(R * 2, 0.06, 0.08))
    // Heading-up marker at the top of the rim (accent)
    kit.part(this.discRoot, "UpMarker", kit.cone, kit.uniqueUnlit(new vec4(0.55, 0.78, 1.0, 0.95)), new vec3(0, 0.3, -R - 1.2), new vec3(1.3, 1.3, 0.4), quat.angleAxis(-Math.PI / 2, vec3.right()))
    kit.part(this.discRoot, "You", kit.sphere, kit.uniqueUnlit(new vec4(1, 1, 1, 1)), new vec3(0, 0.4, 0), new vec3(1.1, 0.6, 1.1))
    // Soft sweep: a thin bright line plus a fading trailing wedge
    this.sweep = makeObj(this.discRoot, "SweepLine")
    kit.part(this.sweep, "SweepGlow", kit.box, kit.uniqueUnlit(new vec4(c.x, c.y, c.z, 0.2)), new vec3(0, 0.18, -R * 0.49), new vec3(0.7, 0.06, R * 0.98))
    kit.part(this.sweep, "Sweep", kit.box, kit.uniqueUnlit(new vec4(c.x, c.y, c.z, 0.85)), new vec3(0, 0.2, -R * 0.49), new vec3(0.16, 0.08, R * 0.98))
    const WEDGES = 14
    for (let i = 1; i <= WEDGES; i++) {
      const m = kit.uniqueUnlit(new vec4(c.x, c.y, c.z, 0.2 * (1 - i / (WEDGES + 1))))
      this.sweepMats.push(m)
      const piv = makeObj(this.sweep, "SweepTrail_" + i)
      piv.getTransform().setLocalRotation(quat.angleAxis(i * 0.045, vec3.up()))
      kit.part(piv, "Wedge", kit.box, m, new vec3(0, 0.15, -R * 0.49), new vec3(R * 0.05, 0.05, R * 0.98))
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
      const b: Blip = {info, obj, glyph, visual, angle: 0, eastKm: 0, northKm: 0, base, hovered: false}
      it.onHoverEnter.add(() => (b.hovered = true))
      it.onHoverExit.add(() => (b.hovered = false))
      it.onTriggerEnd.add(() => this._onBlipTap.invoke(info))
      this.blips.push(b)
    }
    try {
      this.buildTrails(kit)
    } catch (e) {
      print("Radar trail setup failed: " + e)
      this.trailFailed = true
    }
    this.discBasePos = this.discRoot.getTransform().getLocalPosition()
    this.collectDimMats(this.discRoot)
    this.built = true
  }

  /** One dynamic mesh (4 vertices per blip, vertex-colour gradient) and one material for every contrail. */
  private buildTrails(kit: PartKit): void {
    const n = this.blips.length
    const b = new MeshBuilder([
      {name: "position", components: 3},
      {name: "normal", components: 3, normalized: true},
      {name: "texture0", components: 2},
      {name: "color", components: 4}
    ])
    b.topology = MeshTopology.Triangles
    b.indexType = MeshIndexType.UInt16
    const idx: number[] = []
    for (let i = 0; i < n; i++) {
      const v = i * 4
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
    }
    this.trailData = new Array(n * 4 * TRAIL_STRIDE).fill(0)
    for (let i = 0; i < n * 4; i++) this.trailData[i * TRAIL_STRIDE + 4] = 1 // normal +Y
    b.appendVerticesInterleaved(this.trailData)
    b.appendIndices(idx)
    b.updateMesh()
    this.trailBuilder = b
    const R = this.diameterCm / 2
    const mesh = b.getMesh()
    MESH_BOUNDS.set(mesh, {min: new vec3(-R, TRAIL_Y - 0.5, -R), max: new vec3(R, TRAIL_Y + 0.5, R)})
    kit.part(this.discRoot, "RadarTrails", mesh, kit.uniqueUnlit(new vec4(1, 1, 1, 1)), new vec3(0, TRAIL_Y, 0), new vec3(R * 2, 1, R * 2))
  }

  /** Rewrites every contrail quad (head at the icon, tail backward along the heading) and uploads once. */
  private writeTrails(): void {
    const b = this.trailBuilder
    if (!b) return
    const R = this.diameterCm / 2
    const d = this.trailData
    for (let i = 0; i < this.blips.length; i++) {
      const bl = this.blips[i]
      const trk = bl.info.trackDeg * DEG - this.yawAtOpen
      const dx = Math.sin(trk), dz = -Math.cos(trk)
      const p = bl.obj.getTransform().getLocalPosition()
      const speed = Math.max(0, Math.min(1, (bl.info.speedKt - 80) / 420))
      let len = R * TRAIL_LEN_FRAC * (0.6 + 0.8 * speed)
      const pd = p.x * dx + p.z * dz
      const lim = R * 0.99
      const disc = pd * pd - (p.x * p.x + p.z * p.z) + lim * lim
      len = disc > 0 ? Math.min(len, pd + Math.sqrt(disc)) : 0
      if (len < 0.01) len = 0
      const hx = p.x, hz = p.z
      const tx = p.x - dx * len, tz = p.z - dz * len
      const px = -dz, pz = dx // perpendicular in the disc plane
      const hw = len > 0 ? TRAIL_HEAD_W / 2 : 0
      const tw = len > 0 ? TRAIL_TAIL_W / 2 : 0
      const k = i * 4 * TRAIL_STRIDE
      const c = bl.base
      const ha = TRAIL_HEAD_ALPHA
      for (let v = 0; v < 4; v++) {
        const o = k + v * TRAIL_STRIDE
        const head = v < 2
        const side = v % 2 === 0 ? 1 : -1
        const w = head ? hw : tw
        d[o] = (head ? hx : tx) + px * w * side
        d[o + 1] = TRAIL_Y
        d[o + 2] = (head ? hz : tz) + pz * w * side
        d[o + 8] = head ? c.x * ha : 0 // rgb fades to black too, so it also vanishes on an additive display
        d[o + 9] = head ? c.y * ha : 0
        d[o + 10] = head ? c.z * ha : 0
        d[o + 11] = head ? ha : 0
      }
    }
    // setVertexInterleaved writes ONE vertex (12 floats), so upload per vertex
    try {
      const n = this.blips.length * 4
      for (let v = 0; v < n; v++) b.setVertexInterleaved(v, d.slice(v * TRAIL_STRIDE, (v + 1) * TRAIL_STRIDE))
      b.updateMesh()
    } catch (e) {
      if (!this.trailFailed) print("Radar trails disabled: " + e)
      this.trailFailed = true
      this.trailBuilder = null
    }
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
    const n = Math.max(RING_MIN_SEGMENTS, Math.floor(r * 6))
    const mesh = ringMesh("radar_" + r.toFixed(2) + "_" + w, r, w, 0.12, n, "xz") // one draw call per ring
    const bb = MESH_BOUNDS.get(mesh)!
    kit.part(this.discRoot, "RangeRing_" + Math.round(r), mesh, mat, bb.min.add(bb.max).uniformScale(0.5).add(new vec3(0, 0.1, 0)), bb.max.sub(bb.min))
  }

  /** Blip start: real azimuth and ground distance at the moment the radar opens; from then on each blip moves on its own (see moveBlips). */
  private layoutBlips(): void {
    for (const b of this.blips) {
      const az = b.info.azimuthDeg * DEG
      const d = b.info.kind === "satellite" ? this.rangeKm * 0.95 : b.info.distanceKm
      b.eastKm = Math.sin(az) * d
      b.northKm = Math.cos(az) * d
      // Glyph lies flat (faces +Y), nose along the heading relative to the radar's up direction.
      const hdg = b.info.trackDeg * DEG - this.yawAtOpen
      b.visual.getTransform().setLocalRotation(quat.angleAxis(-hdg, vec3.up()).multiply(quat.angleAxis(-Math.PI / 2, vec3.right())))
      this.placeBlip(b)
    }
    this.writeTrails()
  }

  /** Disc-local position of a blip from its km position (azimuth relative to the facing direction at open time). */
  private placeBlip(b: Blip): void {
    const R = this.diameterCm / 2
    const dist = Math.hypot(b.eastKm, b.northKm)
    const rel = Math.atan2(b.eastKm, b.northKm) - this.yawAtOpen
    b.angle = rel
    const frac = Math.min(0.97, dist / this.rangeKm)
    b.obj.getTransform().setLocalPosition(new vec3(Math.sin(rel) * R * frac, 0, -Math.cos(rel) * R * frac))
  }

  /** Real motion: each aircraft advances at its recorded ground speed along its recorded heading; a gradient contrail streams behind each icon. */
  private moveBlips(dt: number): void {
    for (const b of this.blips) {
      if (b.info.kind === "satellite") continue
      const v = b.info.speedKt * KT_TO_KM_S
      const trk = b.info.trackDeg * DEG
      b.eastKm += Math.sin(trk) * v * dt
      b.northKm += Math.cos(trk) * v * dt
      this.placeBlip(b)
    }
    this.writeTrails()
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
    this.moveBlips(dt)
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
