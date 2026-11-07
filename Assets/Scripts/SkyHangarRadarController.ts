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
import {routeColor, edgeFade} from "./SkyHangarRouteLook"

const RING_MIN_SEGMENTS = 96 // smooth circles
const KT_TO_KM_S = 1.852 / 3600
const TRAIL_LEN_FRAC = 0.14 // contrail length as a fraction of the radar radius, before the speed factor
const TRAIL_HEAD_W = 0.2 // ribbon width at the icon / at the tail, cm
const TRAIL_TAIL_W = 0.08
const TRAIL_HEAD_ALPHA = 0.7
const TRAIL_Y = 0.45
const NOSE_CM = 1.2 // the nose sits this far ahead of the icon centre (the icon is ~2.4 cm long)
const TRAIL_SPAN = 1.7 // the trail mesh covers this many radii each way, so an aircraft fading out beyond the circle is never culled
const TRAIL_TEX_MAT = requireAsset("../SkyHangar/Materials/SH_SkyTex.mat") as Material // the textured unlit material (the plain unlit shader has no vertex colour)
const TRAIL_ORDER = 0 // the trails keep the disc's order; the plane icons are lifted above it
const ICON_ORDER = 1
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
  fade: number // 1 inside the circle .. 0 once its nose is EDGE_FADE of the radius beyond it (icon and trail fade together)
}

/** The contrails of one vehicle type: one dynamic mesh and one material (the type's route colour, same as its sky line and dots). */
interface TrailGroup {
  blips: Blip[]
  builder: MeshBuilder
  data: number[]
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
  private tickAcc = 0 // time accumulated for the 20 Hz blip / trail tick
  private tickN = 0
  private built = false
  private yawAtOpen = 0
  private sweepMats: Material[] = []
  private dock = 0 // 0 = normal place, 1 = docked under the card
  private dockTarget = 0
  private lastDim = 1
  private discBasePos = vec3.zero()
  private dimMats: {m: Material; a: number}[] = []
  private trailGroups: TrailGroup[] = []
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
      const b: Blip = {info, obj, glyph, visual, angle: 0, eastKm: 0, northKm: 0, base, hovered: false, fade: 1}
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

  /** One dynamic mesh (4 vertices per blip) and one material per vehicle type; the colour is the type's route colour (plane green, helicopter yellow, satellite blue). */
  private buildTrails(kit: PartKit): void {
    const R = this.diameterCm / 2
    const W = 64, H = 2
    const tex = ProceduralTextureProvider.createWithFormat(W, H, TextureFormat.RGBA8Unorm)
    const px = new Uint8Array(W * H * 4)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4
      px[k] = px[k + 1] = px[k + 2] = 255
      px[k + 3] = Math.round(255 * (1 - x / (W - 1))) // u = 0 at the icon (opaque) -> u = 1 at the tail (clear)
    }
    ;(tex.control as ProceduralTextureProvider).setPixels(0, 0, W, H, px)
    const root = makeObj(this.discRoot, "RadarTrails")
    const kinds: string[] = []
    for (const bl of this.blips) if (kinds.indexOf(bl.info.kind) < 0) kinds.push(bl.info.kind)
    for (const kind of kinds) {
      const blips = this.blips.filter((bl) => bl.info.kind === kind)
      const n = blips.length
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
      const data = new Array(n * 4 * TRAIL_STRIDE).fill(0)
      for (let i = 0; i < n * 4; i++) data[i * TRAIL_STRIDE + 4] = 1 // normal +Y
      b.appendVerticesInterleaved(data)
      b.appendIndices(idx)
      b.updateMesh()
      const c = routeColor(kind)
      const mat = TRAIL_TEX_MAT.clone()
      mat.mainPass.baseTex = tex
      mat.mainPass.baseColor = new vec4(c[0], c[1], c[2], TRAIL_HEAD_ALPHA)
      mat.mainPass.depthWrite = false
      const mesh = b.getMesh()
      const B = R * TRAIL_SPAN
      MESH_BOUNDS.set(mesh, {min: new vec3(-B, TRAIL_Y - 0.5, -B), max: new vec3(B, TRAIL_Y + 0.5, B)})
      kit.part(root, "Trails_" + kind, mesh, mat, new vec3(0, TRAIL_Y, 0), new vec3(B * 2, 1, B * 2))
      this.trailGroups.push({blips, builder: b, data})
    }
    this.setOrderTree(root, TRAIL_ORDER)
    for (const bl of this.blips) this.setOrderTree(bl.visual, ICON_ORDER) // icons draw after (over) the trails
  }

  private setOrderTree(o: SceneObject, order: number): void {
    for (const v of o.getComponents("Component.MaterialMeshVisual") as MaterialMeshVisual[]) v.renderOrder = order
    for (let i = 0; i < o.getChildrenCount(); i++) this.setOrderTree(o.getChild(i), order)
  }

  /** Rewrites every contrail quad (head at the icon, tail backward along the heading) and uploads once per type. A trail is never clipped to the circle; it fades with its aircraft. */
  private writeTrails(): void {
    if (this.trailFailed) return
    const R = this.diameterCm / 2
    for (const g of this.trailGroups) {
      const d = g.data
      for (let i = 0; i < g.blips.length; i++) {
        const bl = g.blips[i]
        const trk = bl.info.trackDeg * DEG - this.yawAtOpen
        const dx = Math.sin(trk), dz = -Math.cos(trk)
        const p = bl.obj.getTransform().getLocalPosition()
        const speed = Math.max(0, Math.min(1, (bl.info.speedKt - 80) / 420))
        let len = R * TRAIL_LEN_FRAC * (0.6 + 0.8 * speed)
        if (bl.fade < 0.003) len = 0 // fully faded out: hidden
        const hx = p.x, hz = p.z
        const tx = p.x - dx * len, tz = p.z - dz * len
        const px = -dz, pz = dx // perpendicular in the disc plane
        const hw = len > 0 ? TRAIL_HEAD_W / 2 : 0
        const tw = len > 0 ? TRAIL_TAIL_W / 2 : 0
        const uHead = 1 - bl.fade // the texture alpha is 1 - u, so starting at u = 1 - fade gives the head an opacity of `fade` (the tail stays clear)
        const k = i * 4 * TRAIL_STRIDE
        for (let v = 0; v < 4; v++) {
          const o = k + v * TRAIL_STRIDE
          const head = v < 2
          const side = v % 2 === 0 ? 1 : -1
          const w = head ? hw : tw
          d[o] = (head ? hx : tx) + px * w * side
          d[o + 1] = TRAIL_Y
          d[o + 2] = (head ? hz : tz) + pz * w * side
          d[o + 6] = head ? uHead : 1
          d[o + 7] = v % 2
        }
      }
      // setVertexInterleaved writes ONE vertex (12 floats), so upload per vertex
      try {
        const n = g.blips.length * 4
        for (let v = 0; v < n; v++) g.builder.setVertexInterleaved(v, d.slice(v * TRAIL_STRIDE, (v + 1) * TRAIL_STRIDE))
        g.builder.updateMesh()
      } catch (e) {
        if (!this.trailFailed) print("Radar trails disabled: " + e)
        this.trailFailed = true
        return
      }
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
    const frac = dist / this.rangeKm // no clamping: past the circle an aircraft fades out and is hidden, and fades back in when it returns
    const x = Math.sin(rel) * R * frac, z = -Math.cos(rel) * R * frac
    b.obj.getTransform().setLocalPosition(new vec3(x, 0, z))
    // fade by the position of the NOSE: full while it is inside the circle, gone EDGE_FADE of the radius beyond it (smoothstep, so it is slow and gentle)
    const trk = b.info.trackDeg * DEG - this.yawAtOpen
    const nose = Math.hypot(x + Math.sin(trk) * NOSE_CM, z - Math.cos(trk) * NOSE_CM)
    b.fade = edgeFade(nose, R)
    const on = b.fade > 0.003
    if (b.obj.enabled !== on) {
      b.obj.enabled = on
      if (!on) b.hovered = false
    }
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
    this.sweepAngle = (this.sweepAngle + (dt / this.sweepSeconds) * Math.PI * 2) % (Math.PI * 2)
    this.sweep.getTransform().setLocalRotation(quat.angleAxis(-this.sweepAngle, vec3.up()))
    // Blip motion (a few km per minute), the contrail mesh upload (every vertex rewritten) and the per-blip glow / material work run at 20 Hz: invisible difference, about a third of the cost.
    this.tickAcc += dt
    if (++this.tickN % 3 !== 0) return
    const tdt = this.tickAcc
    this.tickAcc = 0
    this.moveBlips(tdt)
    for (const b of this.blips) {
      // Brighten as the sweep passes, then decay
      let a = ((this.sweepAngle - (((b.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2))) + Math.PI * 2) % (Math.PI * 2)
      const glow = Math.max(0, 1 - a / 2.2)
      if (b.fade <= 0.003) continue // outside the radar: hidden
      const k = b.hovered ? 1 : 0.25 + 0.75 * glow
      b.obj.getTransform().setLocalScale(b.hovered ? new vec3(1.5, 1.5, 1.5) : vec3.one())
      setGlyphBrightness(b.glyph, b.base, k)
      const am = dim * b.fade
      if (am < 0.999) {
        for (const m of b.glyph.materials) {
          const c = m.mainPass.baseColor
          m.mainPass.baseColor = new vec4(c.x, c.y, c.z, c.w * am)
        }
      }
      if (b.info.kind === "helicopter") spinGlyphRotor(b.glyph, tdt, 0.8)
    }
  }
}
