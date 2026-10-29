// SkyHangarSkyController.ts
// Owns: the preview stand-in sky — one small flat glyph per recorded sky object on a dome around the
// user (20-70 deg up), the aim reticle's corner brackets, the full-route trail (solid + fade behind,
// dotted + fade ahead) drawn on a fixed great-circle route, and tap vs pinch-hold-drag detection.
// The dome follows the camera's POSITION only (sky at infinity) and never rotates.
// Expects @inputs: camera object, primitive meshes + base materials. Emits onAim / onTap / onPullStart.
// Must not: show text (labels live in SkyHangarLabelsUI) or decide what a tap/pull means.

import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import {Interactor, InteractorInputType} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"
import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {AIRPORTS, SKY_OBJECTS, SkyObjectInfo} from "./SkyHangarFlightData"
import {buildGlyph, BuiltGlyph, setGlyphBrightness, spinGlyphRotor} from "./SkyHangarGlyphs"
import {MARK, STROKE, TRAIL} from "./SkyHangarSharedUI"
import {PartKit, makeObj, skyDir, skyTangent, clamp01, hexColor, DEG} from "./SkyHangarUtil"

export interface PullRequest {
  info: SkyObjectInfo
  interactor: Interactor
  worldPos: vec3
}

interface Marker {
  info: SkyObjectInfo
  wrapper: SceneObject
  visual: SceneObject
  glyph: BuiltGlyph
  color: vec4
  dir: vec3
  tangent: vec3
  interactable: Interactable
  hovered: boolean
  bright: number
  flash: number
  past: vec3[] // unit dirs, start -> object (recorded)
  ahead: vec3[] // unit dirs, object -> end (recorded)
  full: vec3[] // fixed great-circle route through the object along its heading, built once: start -> end
  cum: number[] // cumulative arc length (radians) along full
  s: number // current arc position along full (radians)
  rate: number // radians per second along full
}

interface Seg {
  obj: SceneObject
  rmv: RenderMeshVisual
  level: number // alpha level currently assigned (-1 = none), so materials are only swapped when it changes
}

// APPARENT SPEED: every aircraft moves along its fixed route at a slow, steady on-screen angular speed (deg/s),
// like real aircraft seen from the ground. The real ground speed picks the value, clamped to these ranges.
const PLANE_DEG_PER_SEC: [number, number] = [0.1, 0.5]
const HELI_DEG_PER_SEC: [number, number] = [0.05, 0.2]
const SAT_DEG_PER_SEC: [number, number] = [0.3, 0.6]
const HELI_DEG_PER_KM = 0.7 // sky degrees per km flown, for tracks without a destination (about what the plane routes show)
const SAT_PASS_SECONDS = 360 // a real satellite pass across the visible arc takes about this long
const HELI_AHEAD_DEG = 60 // helicopters keep flying this far along their heading (no path is drawn ahead)
const ROUTE_STEPS = 256
const SOLID_SEGMENTS = 96
const DOT_SPACING_DEG = 1.2
const DOT_SIZE_DEG = 0.35
const DOT_POOL = 160 // 1.2 degree spacing over up to ~190 degrees of sky
const ALL_ROUTE_SEGMENTS = 64 // solid chords per vehicle in "All routes" mode (same look as the pinned trail)
const ALL_ROUTE_ALPHA = 0.55 // fraction of the pinned trail's opacity

/** One drawable trail: solid-behind segments + dotted-ahead spheres + shared gradient materials. */
interface TrailSet {
  root: SceneObject
  solid: Seg[]
  dots: Seg[]
  mats: Material[]
  alphaScale: number
  segPts: vec3[]
  segCut: boolean[]
  dotS: number[]
  dotCount: number
  origin: vec3
  dest: vec3
  points: number
}

@component
export class SkyHangarSkyController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarSkyController – virtual sky stand-in</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("The main camera SceneObject (the user's head). The dome follows its position only.")
  cameraObject!: SceneObject
  @input
  @hint("Primitive box mesh used for glyphs, trails and model parts")
  boxMesh!: RenderMesh
  @input
  @hint("Primitive cylinder mesh")
  cylinderMesh!: RenderMesh
  @input
  @hint("Primitive sphere mesh")
  sphereMesh!: RenderMesh
  @input
  @hint("Primitive cone mesh")
  coneMesh!: RenderMesh
  @input
  @hint("Lit base material (cloned per colour)")
  litMaterial!: Material
  @input
  @hint("Unlit, alpha-blended base material (cloned per colour)")
  unlitMaterial!: Material
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Radius of the virtual sky dome in cm (keep under the SIK interactor ray length of 500 cm)")
  @widget(new SliderWidget(200, 480, 10))
  skyDomeRadiusCm: number = 400
  @input
  @hint("Visual size of each sky glyph, cm (13 cm at 4 m is about 1.9 degrees)")
  @widget(new SliderWidget(5, 40, 0.5))
  glyphSpanCm: number = 13
  @input
  @hint("Radius of each marker's pinch target collider in cm — kept generous so small glyphs are easy to aim at")
  @widget(new SliderWidget(10, 60, 1))
  targetRadiusCm: number = 28
  @input("vec4", "{0.95, 0.97, 1.0, 1.0}")
  @hint("Plane glyph colour")
  @widget(new ColorWidget())
  planeColor: vec4 = new vec4(0.95, 0.97, 1.0, 1.0)
  @input("vec4", "{1.0, 0.72, 0.28, 1.0}")
  @hint("Helicopter glyph colour")
  @widget(new ColorWidget())
  helicopterColor: vec4 = new vec4(1.0, 0.72, 0.28, 1.0)
  @input("vec4", "{0.35, 0.9, 1.0, 1.0}")
  @hint("Satellite glyph colour")
  @widget(new ColorWidget())
  satelliteCyan: vec4 = new vec4(0.35, 0.9, 1.0, 1.0)
  @input("vec4", "{0.45, 1.0, 0.6, 1.0}")
  @hint("Trail colour (green per the style guide); alpha fades along the path")
  @widget(new ColorWidget())
  trailTint: vec4 = new vec4(0.45, 1.0, 0.6, 1.0)
  @input
  @hint("Trail line width at the dome, cm (thin)")
  @widget(new SliderWidget(0.3, 5, 0.1))
  trailWidthCm: number = 1.4
  @input
  @hint("Aim reticle size (corner-bracket box side), cm at the dome")
  @widget(new SliderWidget(8, 60, 1))
  reticleSizeCm: number = 24
  @input
  @hint("A pinch released faster than this (s) without moving counts as a tap")
  @widget(new SliderWidget(0.1, 0.8, 0.05))
  tapMaxSeconds: number = 0.3
  @input
  @hint("Ray movement (deg) during a pinch that turns it into a pull")
  @widget(new SliderWidget(1, 15, 0.5))
  dragStartDeg: number = 3
  @input
  @hint("A pinch must be held this long (s) before it can turn into a pull, so a normal tap is never read as a drag")
  @widget(new SliderWidget(0.05, 0.5, 0.01))
  dragDelaySeconds: number = 0.15
  @input
  @hint("Aim assist: the vehicle nearest the gaze within this angle (deg) is aimed, and a pinch that hits nothing taps it")
  @widget(new SliderWidget(0, 6, 0.5))
  aimAssistDeg: number = 3
  @input
  @hint("Show a faint dashed horizon ring so the stand-in sky reads clearly in preview")
  showHorizonRing: boolean = true
  @ui.group_end

  private kit!: PartKit
  private markers: Marker[] = []
  private markerById: {[id: string]: Marker} = {}
  private main!: TrailSet // the pinned / aimed full trail
  private trailId = ""
  private pinnedId = ""
  private allRoutes = false
  private routesRoot: SceneObject | null = null
  private routeSets: {[id: string]: TrailSet} = {}
  private aimedId = ""
  private reticle!: SceneObject
  private reticleMat!: Material
  private pending: {m: Marker; interactor: Interactor; t0: number; dir0: vec3} | null = null
  private built = false
  private rayHover: {[id: string]: Interactor | null} = {}
  private simAim = false
  private lostAt = -1
  private prevTrig = new Map<Interactor, boolean>()
  private retPos: vec3 | null = null
  /** Set false while the sky is not the active view or a model is in the hand (the main script drives this). */
  assistActive = true

  private _onAim = new Event<SkyObjectInfo | null>()
  private _onTap = new Event<SkyObjectInfo>()
  private _onPullStart = new Event<PullRequest>()
  get onAim(): PublicApi<SkyObjectInfo | null> { return this._onAim.publicApi() }
  get onTap(): PublicApi<SkyObjectInfo> { return this._onTap.publicApi() }
  get onPullStart(): PublicApi<PullRequest> { return this._onPullStart.publicApi() }

  onAwake(): void {
    if (!this.cameraObject || !this.boxMesh || !this.litMaterial || !this.unlitMaterial) {
      print("SkyHangarSkyController: required @input not wired")
      return
    }
    this.kit = new PartKit(this.boxMesh, this.cylinderMesh, this.sphereMesh, this.coneMesh, this.litMaterial, this.unlitMaterial)
    this.createEvent("OnStartEvent").bind(() => this.build())
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  // ---------- public API ----------
  get partKit(): PartKit { return this.kit }
  isBuilt(): boolean { return this.built }
  getInfos(): SkyObjectInfo[] { return SKY_OBJECTS }
  getInfo(id: string): SkyObjectInfo | null { return this.markerById[id]?.info ?? null }
  getMarkerCount(kind?: string): number { return this.markers.filter((m) => !kind || m.info.kind === kind).length }
  getMarkerObject(id: string): SceneObject | null { return this.markerById[id]?.wrapper ?? null }
  getMarkerWorldPos(id: string): vec3 | null {
    const m = this.markerById[id]
    return m ? m.wrapper.getTransform().getWorldPosition() : null
  }
  /** Colour of this kind's sky glyph (planes / helicopters / satellites differ). */
  getMarkerColor(kind: string): vec4 {
    return kind === "satellite" ? this.satelliteCyan : kind === "helicopter" ? this.helicopterColor : this.planeColor
  }
  /** Visual angular size of a sky glyph, degrees (same size family for every kind). */
  getMarkerAngularSizeDeg(): number { return (2 * Math.atan(this.glyphSpanCm / 2 / this.skyDomeRadiusCm)) / DEG }
  /** Angular radius of the (larger) pinch target, degrees. */
  getMarkerTargetAngularRadiusDeg(): number { return Math.atan(this.targetRadiusCm / this.skyDomeRadiusCm) / DEG }
  getAimedId(): string { return this.aimedId }
  /** True when a pinch that hits nothing would still tap the selected vehicle (aim assist). */
  hasAssistTarget(): boolean { return this.assistActive && this.aimedId !== "" }
  isAimReticleVisible(): boolean { return this.reticle ? this.reticle.enabled : false }
  getTrailFlightId(): string { return this.trailId }
  isTrailVisible(): boolean { return this.trailId !== "" }
  getTrailOriginPos(): vec3 { return this.sceneObject.getTransform().getWorldPosition().add(this.main.origin) }
  getTrailDestPos(): vec3 { return this.sceneObject.getTransform().getWorldPosition().add(this.main.dest) }
  /** Number of sky-path points drawn for the current trail (past + ahead). */
  getTrailPointCount(): number { return this.trailId ? this.main.points : 0 }
  /** True when the current trail includes a path ahead to a destination airport (planes only). */
  trailHasLandingPath(): boolean {
    const m = this.trailId ? this.markerById[this.trailId] : null
    return !!m && m.info.kind === "plane" && m.ahead.length > 1
  }
  /** Brief highlight pulse (e.g. when a model returns to its place in the sky). */
  flashMarker(id: string): void {
    const m = this.markerById[id]
    if (m) m.flash = 1
  }
  /** Keep a trail visible for a tapped object ("" to clear). */
  setPinnedTrail(id: string): void {
    this.pinnedId = id
    this.refreshTrail()
  }
  getPinnedId(): string { return this.pinnedId }
  isAllRoutes(): boolean { return this.allRoutes }
  /** Show every vehicle's route in the pinned-trail style, slightly fainter (the pinned one keeps its full trail). */
  setAllRoutes(on: boolean): void {
    this.allRoutes = on
    if (on && !this.routesRoot && this.built) this.buildAllRoutes()
    this.refreshTrail()
  }
  /** Test/automation hook: simulate aiming at an object ("" = aim at nothing). */
  simulateAim(id: string): void {
    this.simAim = id !== ""
    for (const m of this.markers) m.hovered = m.info.id === id
    this.aimedId = id
    this.refreshTrail()
    this._onAim.invoke(id ? this.getInfo(id) : null)
  }
  /** Test/automation hook. */
  simulateTap(id: string): boolean {
    const m = this.markerById[id]
    if (!m) return false
    this._onTap.invoke(m.info)
    return true
  }

  // ---------- build ----------
  private build(): void {
    const camPos = this.cameraObject.getTransform().getWorldPosition()
    this.sceneObject.getTransform().setWorldPosition(camPos)
    this.sceneObject.getTransform().setWorldRotation(quat.quatIdentity())
    const objectsRoot = makeObj(this.sceneObject, "SkyObjects")
    for (const info of SKY_OBJECTS) this.buildMarker(objectsRoot, info)
    this.main = this.makeTrailSet(this.sceneObject, "Trail", SOLID_SEGMENTS, DOT_POOL, 1)
    if (this.allRoutes) this.buildAllRoutes()
    this.buildReticle()
    if (this.showHorizonRing) this.buildHorizon()
    this.built = true
  }

  private buildMarker(parent: SceneObject, info: SkyObjectInfo): void {
    const dir = skyDir(info.skyAzimuthDeg, info.skyElevationDeg)
    const tangent = skyTangent(dir, info.trackDeg)
    const wrapper = makeObj(parent, "SkyMarker_" + info.id)
    wrapper.getTransform().setLocalPosition(dir.uniformScale(this.skyDomeRadiusCm))
    const collider = wrapper.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createSphereShape()
    shape.radius = this.targetRadiusCm
    collider.shape = shape
    collider.fitVisual = false
    const interactable = wrapper.createComponent(Interactable.getTypeName()) as Interactable

    // Flat glyph facing the user (dome centre), nose along the direction of travel on the sky.
    const visual = makeObj(wrapper, "Visual")
    let tan = tangent
    if (info.kind === "satellite") tan = new vec3(0, 1, 0).sub(dir.uniformScale(dir.y)).normalize()
    visual.getTransform().setLocalRotation(quat.lookAt(dir.uniformScale(-1), tan))
    const color = this.getMarkerColor(info.kind)
    const glyph = buildGlyph(this.kit, visual, "Glyph", info.kind, this.glyphSpanCm, color)
    const toDirs = (pts: number[][]) => (pts || []).map((p) => skyDir(p[0], p[1]))
    const past = toDirs(info.skyPathPast)
    const ahead = toDirs(info.skyPathAhead)
    const clampRad = (r: number) => Math.min(100 * DEG, Math.max(2 * DEG, r))
    const backRad = clampRad(arcLength(smoothPath(past)))
    const aheadRad = info.kind === "helicopter" ? HELI_AHEAD_DEG * DEG : ahead.length > 1 ? clampRad(arcLength(smoothPath(ahead))) : 30 * DEG
    const full = buildRoute(dir, tangent, backRad, aheadRad)
    const cum = cumulative(full)
    const m: Marker = {
      info, wrapper, visual, glyph, color, dir, tangent, interactable, hovered: false, bright: 0, flash: 0,
      past, ahead, full, cum, s: backRad, rate: motionRate(info, aheadRad, cum[cum.length - 1])
    }
    this.markers.push(m)
    this.markerById[info.id] = m

    // Selection (aimedId) is decided per frame in updateSelection, with hysteresis; these only report what the ray hits.
    interactable.onHoverEnter.add((e: InteractorEvent) => { this.rayHover[info.id] = e.interactor })
    interactable.onHoverExit.add(() => { this.rayHover[info.id] = null })
    interactable.onTriggerStart.add((e: InteractorEvent) => {
      const d = e.interactor.direction
      this.pending = {m, interactor: e.interactor, t0: getTime(), dir0: d ? d : vec3.forward()}
    })
  }

  private makeTrailSet(parent: SceneObject, name: string, solidN: number, dotN: number, alphaScale: number): TrailSet {
    const root = makeObj(parent, name)
    const mats: Material[] = []
    for (let l = 0; l < TRAIL.levels; l++) mats.push(this.kit.uniqueUnlit(new vec4(this.trailTint.x, this.trailTint.y, this.trailTint.z, ((l + 1) / TRAIL.levels) * alphaScale)))
    const mk = (n: string, mesh: RenderMesh): Seg => {
      const obj = this.kit.part(root, n, mesh, mats[0], vec3.zero(), new vec3(1, 1, 1))
      return {obj, rmv: obj.getChild(0).getComponent("Component.RenderMeshVisual") as RenderMeshVisual, level: -1}
    }
    const solid: Seg[] = []
    const dots: Seg[] = []
    for (let i = 0; i < solidN; i++) solid.push(mk("TrailSolid_" + i, this.kit.box))
    for (let i = 0; i < dotN; i++) dots.push(mk("TrailDot_" + i, this.kit.sphere))
    root.enabled = false
    return {root, solid, dots, mats, alphaScale, segPts: [], segCut: [], dotS: [], dotCount: 0, origin: vec3.zero(), dest: vec3.zero(), points: 0}
  }

  /** A fainter copy of the full trail (solid behind, dotted ahead, same gradient and width) for every vehicle, built once. */
  private buildAllRoutes(): void {
    const root = makeObj(this.sceneObject, "AllRoutes")
    this.routesRoot = root
    for (const m of this.markers) {
      const total = m.cum[m.cum.length - 1]
      const dotN = m.info.kind === "plane" ? Math.min(DOT_POOL, Math.floor(total / (DOT_SPACING_DEG * DEG))) : 0
      const t = this.makeTrailSet(root, "Route_" + m.info.id, ALL_ROUTE_SEGMENTS, dotN, ALL_ROUTE_ALPHA)
      this.routeSets[m.info.id] = t
      this.layoutTrail(t, m)
      t.root.enabled = true
    }
    this.updateAllRoutesVisibility()
  }

  private updateAllRoutesVisibility(): void {
    if (!this.routesRoot) return
    this.routesRoot.enabled = this.allRoutes
    for (const id in this.routeSets) this.routeSets[id].root.enabled = id !== this.trailId
  }

  /** Four thin corner brackets around the aimed object, facing the user. */
  private buildReticle(): void {
    this.reticle = makeObj(this.sceneObject, "AimReticle")
    this.reticleMat = this.kit.uniqueUnlit(STROKE.color)
    // Hairline brackets: size and stroke come from the shared tokens (angular size at the dome)
    this.reticleSizeCm = MARK.cm(MARK.bracketDeg, this.skyDomeRadiusCm)
    const h = this.reticleSizeCm / 2
    const L = this.reticleSizeCm * MARK.bracketArmFrac
    const w = STROKE.at(this.skyDomeRadiusCm)
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const c = makeObj(this.reticle, "Corner_" + (sx > 0 ? "R" : "L") + (sy > 0 ? "T" : "B"))
        this.kit.part(c, "H", this.kit.box, this.reticleMat, new vec3(sx * (h - L / 2), sy * h, 0), new vec3(L, w, w))
        this.kit.part(c, "V", this.kit.box, this.reticleMat, new vec3(sx * h, sy * (h - L / 2), 0), new vec3(w, L, w))
        // Rounded ends and a rounded corner
        this.kit.part(c, "CapCorner", this.kit.sphere, this.reticleMat, new vec3(sx * h, sy * h, 0), new vec3(w, w, w))
        this.kit.part(c, "CapH", this.kit.sphere, this.reticleMat, new vec3(sx * (h - L), sy * h, 0), new vec3(w, w, w))
        this.kit.part(c, "CapV", this.kit.sphere, this.reticleMat, new vec3(sx * h, sy * (h - L), 0), new vec3(w, w, w))
      }
    }
    this.reticle.enabled = false
  }

  private buildHorizon(): void {
    const ring = makeObj(this.sceneObject, "HorizonRing")
    const mat = this.kit.uniqueUnlit(new vec4(0.6, 0.75, 1.0, 0.35))
    const n = 72
    const r = this.skyDomeRadiusCm
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const p = new vec3(Math.sin(a) * r, -40, -Math.cos(a) * r)
      this.kit.part(ring, "Dash_" + i, this.kit.box, mat, p, new vec3(r * 0.03, 1.2, 1.2), quat.angleAxis(-a, vec3.up()))
    }
    const north = this.kit.uniqueUnlit(new vec4(1.0, 0.85, 0.4, 0.8))
    this.kit.part(ring, "NorthTick", this.kit.box, north, new vec3(0, -30, -r), new vec3(3, 20, 3))
  }

  /** Advance a marker along its track (demo motion); the glyph points along the heading, the trail follows when aimed. */
  private moveMarker(m: Marker, dt: number): void {
    const total = m.cum[m.cum.length - 1]
    m.s += m.rate * dt
    if (m.s > total) m.s = 0 // looped demo: reappear at the start of the track
    const dir = pointAt(m.full, m.cum, m.s)
    const ahead = pointAt(m.full, m.cum, Math.min(total, m.s + 0.01))
    const back = pointAt(m.full, m.cum, Math.max(0, m.s - 0.01))
    let tan = ahead.sub(back)
    tan = tan.sub(dir.uniformScale(tan.dot(dir)))
    tan = tan.length < 1e-6 ? m.tangent : tan.normalize()
    m.dir = dir
    m.tangent = tan
    m.wrapper.getTransform().setLocalPosition(dir.uniformScale(this.skyDomeRadiusCm))
    if (m.info.kind === "satellite") tan = new vec3(0, 1, 0).sub(dir.uniformScale(dir.y)).normalize()
    m.visual.getTransform().setLocalRotation(quat.lookAt(dir.uniformScale(-1), tan))
    if (this.trailId === m.info.id) this.updateTrail(this.main, m)
    else if (this.allRoutes && this.routeSets[m.info.id]) this.updateTrail(this.routeSets[m.info.id], m)
  }

  /** Lay a box segment from a to b (sky-local; the trail root sits at the sky origin, unrotated). */
  private placeSegment(seg: SceneObject, a: vec3, b: vec3, width: number): void {
    const mid = a.add(b).uniformScale(0.5)
    const d = b.sub(a)
    const len = Math.max(d.length, 0.01)
    const t = seg.getTransform()
    t.setLocalPosition(mid)
    t.setLocalRotation(quat.lookAt(d.normalize(), mid.normalize()))
    t.setLocalScale(new vec3(width, width * 0.4, len * 1.02)) // 2% overlap so joints never open a gap
  }

  /** Shared gradient materials re-tinted for the object being aimed at (alpha per level is fixed). */
  private tintTrail(t: TrailSet, c: vec4): void {
    for (let l = 0; l < t.mats.length; l++) t.mats[l].mainPass.baseColor = new vec4(c.x, c.y, c.z, ((l + 1) / t.mats.length) * t.alphaScale)
  }
  private setLevel(t: TrailSet, s: Seg, alpha: number): void {
    const n = t.mats.length
    const lv = Math.max(0, Math.min(n - 1, Math.round(alpha * n) - 1))
    if (s.level !== lv) {
      s.level = lv
      s.rmv.mainMaterial = t.mats[lv]
    }
  }
  private show(s: Seg, on: boolean): void {
    if (s.obj.enabled !== on) s.obj.enabled = on
  }

  private refreshTrail(): void {
    // The full trail belongs to the pinned object, else to the aimed one (it goes away as soon as you look away).
    const id = this.pinnedId || this.aimedId
    const m = id ? this.markerById[id] : null
    if (!m || m.past.length < 2) {
      this.trailId = ""
      this.main.points = 0
      this.main.root.enabled = false
      this.updateAllRoutesVisibility()
      return
    }
    if (this.trailId !== m.info.id || !this.main.root.enabled) {
      this.trailId = m.info.id
      this.main.root.enabled = true
      this.layoutTrail(this.main, m)
    }
    this.updateAllRoutesVisibility()
  }

  /** Fixed trail geometry along the route, built when a trail is shown. Nothing here depends on the vehicle's position. */
  private layoutTrail(t: TrailSet, m: Marker): void {
    const r = this.skyDomeRadiusCm
    const kind = m.info.kind
    const toLocal = (d: vec3) => d.uniformScale(r)
    const W = STROKE.at(r) * (TRAIL.widthMm / 1.5)
    const total = m.cum[m.cum.length - 1]
    const n = t.solid.length
    t.points = m.past.length + m.ahead.length
    t.origin = toLocal(m.full[0])
    this.tintTrail(t, kind === "satellite" ? this.satelliteCyan : kind === "helicopter" ? this.helicopterColor : this.trailAccent(m.info))

    // Solid line: SOLID_SEGMENTS equal chords on the route, placed once.
    t.segPts = sampleRange(m.full, m.cum, 0, total, n).map(toLocal)
    t.segCut = []
    for (let j = 0; j < n; j++) {
      this.placeSegment(t.solid[j].obj, t.segPts[j], t.segPts[j + 1], W)
      t.segCut.push(false)
      t.solid[j].level = -1
      t.solid[j].obj.enabled = false
    }

    // Dots (planes only): fixed arc positions every DOT_SPACING_DEG from the route start. Everything sits on the
    // dome, so equal arc = equal viewing angle; each dot is DOT_SIZE_DEG across.
    t.dotS = []
    t.dotCount = 0
    if (kind === "plane") {
      t.dotCount = Math.min(t.dots.length, Math.floor(total / (DOT_SPACING_DEG * DEG)))
      const dotCm = r * 2 * Math.tan((DOT_SIZE_DEG * DEG) / 2)
      for (let k = 0; k < t.dotCount; k++) {
        const sk = (k + 1) * DOT_SPACING_DEG * DEG
        t.dotS.push(sk)
        const d = t.dots[k]
        d.level = -1
        d.obj.getTransform().setLocalPosition(toLocal(pointAt(m.full, m.cum, sk)))
        d.obj.getTransform().setLocalScale(new vec3(dotCm, dotCm, dotCm))
      }
    }
    for (let k = t.dotCount; k < t.dots.length; k++) t.dots[k].obj.enabled = false
    t.dest = kind === "helicopter" ? t.origin : toLocal(m.full[m.full.length - 1])
    this.updateTrail(t, m)
  }

  /** Per frame: only opacity (and the segment ending at the glyph) changes; line and dots stay where they are. */
  private updateTrail(t: TrailSet, m: Marker): void {
    const r = this.skyDomeRadiusCm
    const kind = m.info.kind
    const total = m.cum[m.cum.length - 1]
    const s = m.s
    const fade = (u: number) => 0.03 + 0.97 * Math.pow(1 - Math.min(1, Math.max(0, u)), 1.6)
    const n = t.solid.length
    const step = total / n
    const W = STROKE.at(r) * (TRAIL.widthMm / 1.5)

    if (kind === "satellite") {
      // Orbit arc through the satellite, fading both ways.
      const fsat = s / Math.max(total, 1e-6)
      for (let j = 0; j < n; j++) {
        const u = (j + 0.5) / n
        const d = u < fsat ? (fsat - u) / Math.max(fsat, 1e-6) : (u - fsat) / Math.max(1 - fsat, 1e-6)
        this.show(t.solid[j], true)
        this.setLevel(t, t.solid[j], TRAIL.peakBehind * 0.8 * fade(d))
      }
      return
    }

    // Behind: solid, from the route start up to just outside the glyph, fading toward the origin.
    const end = s - TRAIL.gapFromGlyphCm / r
    for (let j = 0; j < n; j++) {
      const seg = t.solid[j]
      const a = j * step, b = a + step
      if (a >= end) { this.show(seg, false); continue }
      const cut = b > end
      if (cut) this.placeSegment(seg.obj, t.segPts[j], pointAt(m.full, m.cum, end).uniformScale(r), W)
      else if (t.segCut[j]) this.placeSegment(seg.obj, t.segPts[j], t.segPts[j + 1], W)
      t.segCut[j] = cut
      this.show(seg, true)
      this.setLevel(t, seg, TRAIL.peakBehind * fade((s - (a + Math.min(b, end)) / 2) / Math.max(s, 1e-6)))
    }

    // Ahead: dots at fixed positions, fading toward the destination; the vehicle flies through them.
    for (let k = 0; k < t.dotCount; k++) {
      const d = t.dots[k]
      const sk = t.dotS[k]
      if (sk <= s) { this.show(d, false); continue }
      this.show(d, true)
      this.setLevel(t, d, TRAIL.peakAhead * fade((sk - s) / Math.max(total - s, 1e-6)))
    }
  }

  /** Airline accent for the line: the recorded accent colour, lifted slightly toward white for a soft glow. */
  private trailAccent(info: SkyObjectInfo): vec4 {
    const hex = info.colors && info.colors.length > 1 ? info.colors[1] : info.colors && info.colors.length ? info.colors[0] : ""
    const c = hex ? hexColor(hex) : this.trailTint
    return new vec4(c.x + (1 - c.x) * 0.2, c.y + (1 - c.y) * 0.2, c.z + (1 - c.z) * 0.2, 1)
  }

  // ---------- per frame ----------
  private update(): void {
    if (!this.built) return
    const dt = getDeltaTime()
    const camPos = this.cameraObject.getTransform().getWorldPosition()
    this.sceneObject.getTransform().setWorldPosition(camPos)
    for (const m of this.markers) {
      this.moveMarker(m, dt)
      const want = m.hovered || m.info.id === this.pinnedId ? 1 : 0
      m.flash = Math.max(0, m.flash - dt * 0.8)
      const target = Math.max(want, m.flash)
      if (Math.abs(target - m.bright) > 0.002) {
        m.bright += (target - m.bright) * clamp01(dt * 10)
        setGlyphBrightness(m.glyph, m.color, m.bright)
        const s = 1 + 0.25 * m.bright
        m.visual.getTransform().setLocalScale(new vec3(s, s, s))
      }
      if (m.info.kind === "helicopter") spinGlyphRotor(m.glyph, dt, 0.8)
    }
    this.updateSelection(camPos)
    this.pollAssistPinch()
    // Aim reticle: corner brackets around the aimed object only (gentle magnet when it moves to a new target).
    const aimed = this.aimedId || this.pinnedId ? this.markerById[this.aimedId || this.pinnedId] : null
    if (aimed) {
      const wasOn = this.reticle.enabled
      this.reticle.enabled = true
      const target = aimed.wrapper.getTransform().getWorldPosition()
      this.retPos = wasOn && this.retPos ? vec3.lerp(this.retPos, target, clamp01(dt * 14)) : target
      const p = this.retPos
      const rt = this.reticle.getTransform()
      rt.setWorldPosition(p)
      const toUser = camPos.sub(p).normalize()
      rt.setWorldRotation(quat.lookAt(toUser, vec3.up()))
    } else if (this.reticle.enabled) {
      this.reticle.enabled = false
    }
    this.updatePending()
  }

  private angleTo(m: Marker, origin: vec3, dir: vec3): number {
    const v = m.wrapper.getTransform().getWorldPosition().sub(origin).normalize()
    return Math.acos(Math.max(-1, Math.min(1, v.dot(dir.normalize())))) / DEG
  }

  /** Switching away from the current selection needs the newcomer to be this much closer (deg) to the pointer. */
  private static readonly SWITCH_MARGIN_DEG = 0.8
  /** The selection survives this long (s) after the pointer leaves it. */
  private static readonly KEEP_SECONDS = 0.3

  /**
   * Decides aimedId each frame: the vehicle under the pinch ray, else (aim assist) the one nearest the gaze within aimAssistDeg.
   * Hysteresis: a switch needs the new vehicle to be clearly closer than the old one, and a lost target is kept for KEEP_SECONDS.
   */
  private updateSelection(camPos: vec3): void {
    if (this.simAim) return
    let cands: {m: Marker; ang: number}[] = []
    for (const m of this.markers) {
      const it = this.rayHover[m.info.id]
      const d = it ? it.direction : null
      const o = it ? it.startPoint : null
      if (it && d && o) cands.push({m, ang: this.angleTo(m, o, d)})
    }
    if (cands.length === 0 && this.assistActive && this.aimAssistDeg > 0) {
      const fwd = this.cameraObject.getTransform().getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
      for (const m of this.markers) {
        const ang = this.angleTo(m, camPos, fwd)
        if (ang < this.aimAssistDeg) cands.push({m, ang})
      }
    }
    let best: {m: Marker; ang: number} | null = null
    for (const c of cands) if (!best || c.ang < best.ang) best = c
    const cur = this.aimedId ? cands.find((c) => c.m.info.id === this.aimedId) ?? null : null
    let want = this.aimedId
    if (best) {
      this.lostAt = -1
      if (!this.aimedId || !cur) want = best.m.info.id
      else if (best.m.info.id !== this.aimedId && best.ang < cur.ang - SkyHangarSkyController.SWITCH_MARGIN_DEG) want = best.m.info.id
    } else if (this.aimedId) {
      if (this.lostAt < 0) this.lostAt = getTime()
      if (getTime() - this.lostAt >= SkyHangarSkyController.KEEP_SECONDS) { want = ""; this.lostAt = -1 }
    }
    if (want === this.aimedId) return
    for (const m of this.markers) m.hovered = m.info.id === want
    this.aimedId = want
    this.refreshTrail()
    this._onAim.invoke(want ? this.getInfo(want) : null)
  }

  /** Per-frame: a fresh pinch that hits no vehicle taps / pulls the currently selected one (aim assist and hysteresis). */
  private pollAssistPinch(): void {
    const all = SIK.InteractionManager.getInteractorsByType(InteractorInputType.All)
    for (const it of all) {
      const now = it.isTriggering
      const was = this.prevTrig.get(it) ?? false
      if (now && !was && this.assistActive && !this.pending && it.currentInteractable === null && this.aimedId) {
        const m = this.markerById[this.aimedId]
        const d = it.direction
        if (m) this.pending = {m, interactor: it, t0: getTime(), dir0: d ? d : vec3.forward()}
      }
      this.prevTrig.set(it, now)
    }
  }

  private updatePending(): void {
    const p = this.pending
    if (!p) return
    const elapsed = getTime() - p.t0
    const d = p.interactor.direction
    const moved = d ? Math.acos(Math.max(-1, Math.min(1, d.normalize().dot(p.dir0.normalize())))) / DEG : 0
    if (!p.interactor.isTriggering) {
      this.pending = null
      if (elapsed < this.tapMaxSeconds && (moved < this.dragStartDeg || elapsed < this.dragDelaySeconds)) this._onTap.invoke(p.m.info)
      else this.firePull(p.m, p.interactor) // a slow release is still a pull
      return
    }
    // A drag needs both a short hold and a little movement; holding still for tapMaxSeconds also starts the pull.
    if (elapsed >= this.tapMaxSeconds || (elapsed >= this.dragDelaySeconds && moved >= this.dragStartDeg)) {
      this.pending = null
      this.firePull(p.m, p.interactor)
    }
  }

  private firePull(m: Marker, interactor: Interactor): void {
    this._onPullStart.invoke({info: m.info, interactor, worldPos: m.wrapper.getTransform().getWorldPosition()})
  }
}

// ---------- trail path helpers (unit directions on the sky dome) ----------

/** Catmull-Rom through the path points, re-projected onto the unit sphere: a smooth dense curve. */
function smoothPath(pts: vec3[]): vec3[] {
  const n = pts.length
  if (n < 3) return pts.slice()
  const out: vec3[] = []
  const sub = 6
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)]
    for (let s = 0; s < sub; s++) {
      const t = s / sub, t2 = t * t, t3 = t2 * t
      const c = (a: number, b: number, cc: number, d: number) =>
        0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3)
      out.push(new vec3(c(p0.x, p1.x, p2.x, p3.x), c(p0.y, p1.y, p2.y, p3.y), c(p0.z, p1.z, p2.z, p3.z)).normalize())
    }
  }
  out.push(pts[n - 1].normalize())
  return out
}

/** Total angle (radians) along a dense path of unit directions. */
function arcLength(path: vec3[]): number {
  let total = 0
  for (let i = 1; i < path.length; i++) total += Math.acos(Math.max(-1, Math.min(1, path[i - 1].dot(path[i]))))
  return total
}

/** n+1 points evenly spaced by arc length, starting startRad along the path and ending at its end. */
function arcResample(path: vec3[], n: number, startRad: number): {pts: vec3[]; total: number} {
  const cum: number[] = [0]
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.acos(Math.max(-1, Math.min(1, path[i - 1].dot(path[i])))))
  const total = cum[cum.length - 1]
  const from = Math.min(startRad, total * 0.5)
  const pts: vec3[] = []
  let idx = 0
  for (let k = 0; k <= n; k++) {
    const target = from + ((total - from) * k) / n
    while (idx < path.length - 2 && cum[idx + 1] < target) idx++
    const span = Math.max(cum[idx + 1] - cum[idx], 1e-9)
    const f = Math.max(0, Math.min(1, (target - cum[idx]) / span))
    pts.push(vec3.lerp(path[idx], path[idx + 1], f).normalize())
  }
  return {pts, total}
}

// ---------- demo motion: tracks (unit directions on the sky dome) ----------

/** Cumulative arc length (radians) along a dense path. */
function cumulative(path: vec3[]): number[] {
  const cum: number[] = [0]
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.acos(Math.max(-1, Math.min(1, path[i - 1].dot(path[i])))))
  return cum
}

function nearestIndex(path: vec3[], dir: vec3): number {
  let best = 0, bd = -2
  for (let i = 0; i < path.length; i++) {
    const d = path[i].dot(dir)
    if (d > bd) { bd = d; best = i }
  }
  return best
}

/** Unit direction at arc position s (radians) along the path. */
function pointAt(path: vec3[], cum: number[], s: number): vec3 {
  const total = cum[cum.length - 1]
  const x = Math.max(0, Math.min(total, s))
  let lo = 0, hi = cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= x) lo = mid
    else hi = mid
  }
  const span = Math.max(cum[hi] - cum[lo], 1e-9)
  return vec3.lerp(path[lo], path[hi], Math.max(0, Math.min(1, (x - cum[lo]) / span))).normalize()
}

/** n+1 points evenly spaced in arc length from a to b (b may be smaller than a). */
function sampleRange(path: vec3[], cum: number[], a: number, b: number, n: number): vec3[] {
  const out: vec3[] = []
  for (let k = 0; k <= n; k++) out.push(pointAt(path, cum, a + ((b - a) * k) / n))
  return out
}

/** Fixed route: the great circle through `dir` along `tangent`, from backRad behind to aheadRad ahead (built once). */
function buildRoute(dir: vec3, tangent: vec3, backRad: number, aheadRad: number): vec3[] {
  const t = tangent.sub(dir.uniformScale(tangent.dot(dir))).normalize()
  const out: vec3[] = []
  for (let k = 0; k <= ROUTE_STEPS; k++) {
    const a = -backRad + ((backRad + aheadRad) * k) / ROUTE_STEPS
    out.push(dir.uniformScale(Math.cos(a)).add(t.uniformScale(Math.sin(a))).normalize())
  }
  return out
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * p) / 2) ** 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lon2 - lon1) * p) / 2) ** 2
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Radians per second along the route: the real ground speed sets the pace, clamped to a calm apparent speed. */
function motionRate(info: SkyObjectInfo, aheadRad: number, total: number): number {
  const kmPerSec = (info.speedKt * 1.852) / 3600
  const clampDeg = (rate: number, r: [number, number]) => Math.max(r[0] * DEG, Math.min(r[1] * DEG, rate))
  if (info.kind === "satellite") return clampDeg(total / SAT_PASS_SECONDS, SAT_DEG_PER_SEC)
  if (info.kind === "helicopter") return clampDeg(kmPerSec * HELI_DEG_PER_KM * DEG, HELI_DEG_PER_SEC)
  const ap = AIRPORTS[info.destination]
  const remKm = ap ? haversineKm(info.lat, info.lon, ap.lat, ap.lon) : kmPerSec * info.arrivingInMin * 60
  const radPerKm = remKm > 1 ? aheadRad / remKm : HELI_DEG_PER_KM * DEG
  return clampDeg(kmPerSec * radPerKm, PLANE_DEG_PER_SEC)
}
