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
import {buildPlaneRoute, getObserver, heliTrack, horizonSpan} from "./SkyHangarRouteGeo"
import {routeWidthMul, routeOpacityMul, PINNED_WIDTH, ROUTE_COLORS} from "./SkyHangarRouteLook"
import {SkyHangarBirds} from "./SkyHangarBirds"
import {PartKit, makeObj, skyDir, skyTangent, clamp01, DEG} from "./SkyHangarUtil"
import {AimCandidate, HOVER_KEEP_SECONDS, TAP_MAX_SECONDS, dragStarted, isTap, pickAimTarget, rayMoveCm} from "./SkyHangarInput"

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
  acc: number // seconds of motion not yet applied (markers move at 20 Hz; the aimed / pinned one every frame)
  rate: number // radians per second along full
  distScale: number // icon size by distance: DIST_SCALE_NEAR (nearest) .. DIST_SCALE_FAR (farthest); labels keep one size
  oldFadeRad: number // soft fade-in length at the old end of the drawn path (helicopters; 0 = none)
  originTag: vec3 | null // unit dir of the origin airport tag; only set when that airport is within TAG_RANGE_KM on the ground line
  destTag: vec3 | null // same for the destination airport
}

interface Seg {
  obj: SceneObject
  rmv: RenderMeshVisual
  level: number // alpha level currently assigned (-1 = none), so materials are only swapped when it changes
}

// ICON SIZE BY DISTANCE: a gentle 120% for the nearest aircraft down to 70% for the farthest (satellites count as farthest).
const DIST_SCALE_NEAR = 1.2
const DIST_SCALE_FAR = 0.7
function distanceScale(info: SkyObjectInfo): number {
  if (info.kind === "satellite") return DIST_SCALE_FAR
  let lo = 1e9, hi = -1e9
  for (const o of SKY_OBJECTS) {
    if (o.kind === "satellite") continue
    lo = Math.min(lo, o.distanceKm)
    hi = Math.max(hi, o.distanceKm)
  }
  const t = hi > lo ? (info.distanceKm - lo) / (hi - lo) : 0
  return DIST_SCALE_NEAR + (DIST_SCALE_FAR - DIST_SCALE_NEAR) * Math.max(0, Math.min(1, t))
}

// APPARENT SPEED: every aircraft moves along its fixed route at a slow, steady on-screen angular speed (deg/s),
// like real aircraft seen from the ground. The real ground speed picks the value, clamped to these ranges.
const PLANE_DEG_PER_SEC: [number, number] = [0.1, 0.5]
const HELI_DEG_PER_SEC: [number, number] = [0.2, 0.4] // helicopters: 4x the original pace ([0.05, 0.2]) and below the planes' top speed (0.5); the lower clamp is what set the old speed, trails and route lines follow the path so they stay matched
const HELI_ROUTE_DEG_PER_KM = 2.8 // sky degrees per km flown for helicopter tracks (4x the original 0.7)
const SAT_DEG_PER_SEC: [number, number] = [0.3, 0.6]
const HELI_DEG_PER_KM = 0.7 // sky degrees per km flown, for tracks without a destination (about what the plane routes show)
const SAT_PASS_SECONDS = 360 // a real satellite pass across the visible arc takes about this long
const ROUTE_STEPS = 256
const DOT_SPACING_DEG = 1.2
const DOT_SIZE_DEG = 0.25
const DOT_POOL = 200 // 1.2 degree spacing over up to ~240 degrees of sky
const MARKER_RENDER_ORDER = 10 // above the trail ribbon (4) and its dots (5)
const DOT_FADE_NEAR_DEG = 1.5 // a dot is gone this close to the plane...
const DOT_FADE_FAR_DEG = 6 // ...and fully visible from this far
const TAG_RANGE_KM = 40 // an airport tag is shown only for an airport this close to the observer
const TAG_MAX_EL_DEG = 2 // ...and sits on the ground line, never higher than this
const ALL_ROUTE_ALPHA = 0.55 // fraction of the pinned trail's opacity
const PINNED_BOOST = 1.18 // selected trail opacity multiplier ("slightly brighter")
const RIBBON_SAMPLES = 220 // spline samples along each drawn trail (dense, so the ribbon is smooth at any zoom)
const RIBBON_REBUILD_DEG = 0.04 // the ribbon is re-laid when its vehicle has moved this far along the route
const RIBBON_END_FADE_DEG = 0.8 // soft fade-out where the line stops short of the glyph
// Trail colours per kind (rgb): fixed, the same day and night, shared by the route line, the dotted trail and the radar trail (SkyHangarRouteLook).
const TRAIL_RGB: {[kind: string]: vec3} = {
  plane: new vec3(ROUTE_COLORS.plane[0], ROUTE_COLORS.plane[1], ROUTE_COLORS.plane[2]), // neon green 80, 255, 140
  helicopter: new vec3(ROUTE_COLORS.helicopter[0], ROUTE_COLORS.helicopter[1], ROUTE_COLORS.helicopter[2]), // yellow 255, 215, 40
  satellite: new vec3(ROUTE_COLORS.satellite[0], ROUTE_COLORS.satellite[1], ROUTE_COLORS.satellite[2]) // neon cyan 0, 240, 255
}
// GENTLE PLANE ROUTES: the true sky arc is blended toward a gentler curve, the turn rate is capped and the whole route
// may only change direction by MAX_TOTAL_TURN, so trails look like a plane trail with a slight Earth-curve bend.
const GENTLE_BLEND = 0.4 // fraction of the true curvature kept
const MAX_TURN_RATE = 0.25 // max radians turned per radian of arc travelled
const MAX_TOTAL_TURN = 25 * DEG // max summed direction change along one whole route
const EXTEND_STEP = 0.5 * DEG // arc per step when a route is carried on to the horizon (4000 steps is more than a full circle)
const HORIZON_END_Y = Math.sin(-1 * DEG) // routes always run on to the horizon (to just below it, where they are fully faded)

/** One drawable trail: a smooth ribbon (+ soft underlay) behind the vehicle, dotted-ahead spheres, shared dot materials. */
interface TrailSet {
  root: SceneObject
  ribbon: Ribbon
  rgb: vec3
  dots: Seg[]
  mats: Material[]
  alphaScale: number
  boost: number
  widthScale: number
  opaque: boolean // satellites: full alpha (no peak / all-routes / day multipliers); the tail fade and the shared elevation (horizon) fade still apply
  lastS: number // arc position the ribbon was last laid for (NaN = must rebuild)
  dotS: number[]
  dotElev: number[] // elevation fade (0..1) of each dot, fixed by its place on the route
  dotCount: number
  origin: vec3 | null // sky-local airport tag positions (null = no tag)
  dest: vec3 | null
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
  @hint("Trails are fully opaque at and above this elevation (deg)")
  @widget(new SliderWidget(1, 40, 0.5))
  fadeStartElevDeg: number = 14
  @input
  @hint("Trails have faded to nothing at this elevation (deg); smoothstep between the two")
  @widget(new SliderWidget(-5, 20, 0.5))
  fadeEndElevDeg: number = 0
  @input
  @hint("Aim reticle size (corner-bracket box side), cm at the dome")
  @widget(new SliderWidget(8, 60, 1))
  reticleSizeCm: number = 24
  @input
  @hint("Aim assist: the vehicle nearest the gaze within this angle (deg) is aimed, and a pinch that hits nothing taps it")
  @widget(new SliderWidget(0, 6, 0.5))
  aimAssistDeg: number = 3
  @input
  @hint("Show a faint dashed horizon ring so the stand-in sky reads clearly in preview")
  showHorizonRing: boolean = true
  @ui.group_end

  private kit!: PartKit
  private birds: SkyHangarBirds | null = null // far-away birds that fly by now and then (decor only: not selectable, not in the radar)
  private markers: Marker[] = []
  private markerById: {[id: string]: Marker} = {}
  private frameNo = 0
  private gazeCache: vec3 | null = null
  private assistPick: {id: string; angleDeg: number} | null = null // last aim-assist pick (recomputed at 20 Hz)
  private assistFrame = -99
  private main!: TrailSet // the pinned / aimed full trail
  private trailId = ""
  private pinnedId = ""
  private mainPinned = false
  private pendingEmpty: {interactor: Interactor; t0: number; dir0: vec3} | null = null
  private allRoutes = false
  private routesRoot: SceneObject | null = null
  private routeSets: {[id: string]: TrailSet} = {}
  private dayAmt = 0 // 0 at night .. 1 by day: the route and trail lines turn neon green, thicker and fully opaque (see SkyHangarRouteLook)
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
  private _onTapEmpty = new Event<void>()
  private _onPullStart = new Event<PullRequest>()
  get onAim(): PublicApi<SkyObjectInfo | null> { return this._onAim.publicApi() }
  get onTap(): PublicApi<SkyObjectInfo> { return this._onTap.publicApi() }
  /** A short pinch that started on nothing (no vehicle hovered or aimed). */
  get onTapEmpty(): PublicApi<void> { return this._onTapEmpty.publicApi() }
  get onPullStart():PublicApi<PullRequest> { return this._onPullStart.publicApi() }

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
  /** Smoothed world position of the aim brackets' centre (null while hidden) — the label anchors to this, not the raw marker. */
  getReticleWorldPos(): vec3 | null { return this.reticle && this.reticle.enabled ? this.retPos : null }
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
  getTrailOriginPos(): vec3 | null { return this.main.origin ? this.sceneObject.getTransform().getWorldPosition().add(this.main.origin) : null }
  getTrailDestPos(): vec3 | null { return this.main.dest ? this.sceneObject.getTransform().getWorldPosition().add(this.main.dest) : null }
  /** Number of sky-path points drawn for the current trail (past + ahead). */
  getTrailPointCount(): number { return this.trailId ? this.main.points : 0 }
  /** True when the current trail includes a path ahead to a destination airport (planes only). */
  trailHasLandingPath(): boolean {
    const m = this.trailId ? this.markerById[this.trailId] : null
    return !!m && m.info.kind === "plane" && m.ahead.length > 1
  }
  /** World positions along an object's route within +-spanDeg of it (n per side), for placing its label clear of the trail. */
  getRouteSamplesWorld(id: string, spanDeg: number = 30, n: number = 40): vec3[] {
    const m = this.markerById[id]
    if (!m) return []
    const root = this.sceneObject.getTransform().getWorldPosition()
    const total = m.cum[m.cum.length - 1]
    const out: vec3[] = []
    for (let i = -n; i <= n; i++) {
      if (i === 0) continue
      const x = Math.max(0, Math.min(total, m.s + (i / n) * spanDeg * DEG))
      out.push(root.add(pointAt(m.full, m.cum, x).uniformScale(this.skyDomeRadiusCm)))
    }
    return out
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
  /** Test/automation hook: tap on empty sky. */
  simulateTapEmpty(): void { this._onTapEmpty.invoke() }
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
    this.main = this.makeTrailSet(this.sceneObject, "Trail", DOT_POOL, 1)
    if (this.allRoutes) this.buildAllRoutes()
    this.buildReticle()
    this.birds = new SkyHangarBirds(this.sceneObject, this.unlitMaterial)
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
    setRenderOrderDeep(glyph.root, MARKER_RENDER_ORDER) // the marker is always drawn above the trail (ribbon 4, dots 5)
    const ds = distanceScale(info)
    visual.getTransform().setLocalScale(new vec3(ds, ds, ds))
    const toDirs = (pts: number[][]) => (pts || []).map((p) => skyDir(p[0], p[1]))
    const past = toDirs(info.skyPathPast)
    const ahead = toDirs(info.skyPathAhead)
    // Route: planes follow the real great circle between their airports; everything else (satellites, helicopters, planes
    // with no airport route) runs along its great circle to the horizon both ways. No route ever stops short of the horizon.
    const pr = info.kind === "plane" ? buildPlaneRoute(info) : null
    const ht = info.kind === "helicopter" ? heliTrack(info) : null // helicopters: the recorded path, then (like planes) a dotted line on along the last heading to the horizon (an estimate)
    let full: vec3[]
    let anchor = 0
    let s0 = 0
    let ahd = 0
    let heliEnd = 0
    let oldFade = 0
    let originTag: vec3 | null = null
    let destTag: vec3 | null = null
    if (pr) {
      const g = gentleRoute(pr.dirs, pr.planeIndex, pr.startOnGround, pr.endOnGround)
      full = g.dirs
      anchor = g.anchor
      const ob = getObserver()
      const near = (code: string) => {
        const A = AIRPORTS[code]
        return !!A && haversineKm(ob.lat, ob.lon, A.lat, A.lon) <= TAG_RANGE_KM
      }
      const low = (v: vec3) => v.y <= Math.sin(TAG_MAX_EL_DEG * DEG)
      if (pr.startOnGround && near(info.origin) && low(full[0])) originTag = full[0]
      if (pr.endOnGround && near(info.destination) && low(full[full.length - 1])) destTag = full[full.length - 1]
    } else if (ht) {
      // The recorded path ends at the helicopter; the great circle on from there only carries its demo motion.
      const last = ht.dirs[ht.dirs.length - 1]
      const tan = tangentToward(last, last.add(last.sub(ht.dirs[Math.max(0, ht.dirs.length - 3)])))
      const span = horizonSpan(last, tan)
      full = ht.dirs.concat(buildRoute(last, tan, 0, span.ahead).slice(1))
      heliEnd = ht.dirs.length - 1
      ahd = span.ahead
    } else {
      const span = horizonSpan(dir, tangent)
      full = buildRoute(dir, tangent, span.back, span.ahead)
      s0 = span.back
      ahd = span.ahead
    }
    const cum = cumulative(full)
    if (ht) {
      s0 = cum[heliEnd]
      oldFade = Math.min(8 * DEG, s0 * 0.5)
    }
    if (pr) {
      s0 = cum[anchor]
      ahd = cum[cum.length - 1] - s0
    }
    const m: Marker = {
      info, wrapper, visual, glyph, color, dir, tangent, interactable, hovered: false, bright: 0, flash: 0,
      past, ahead, full, cum, s: s0, acc: 0, rate: motionRate(info, ahd, cum[cum.length - 1]), distScale: distanceScale(info), oldFadeRad: oldFade, originTag, destTag
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

  private makeTrailSet(parent: SceneObject, name: string, dotN: number, alphaScale: number): TrailSet {
    const root = makeObj(parent, name)
    const mats: Material[] = []
    for (let l = 0; l < TRAIL.levels; l++) {
      const m = TRAIL_TEX_MAT.clone()
      m.mainPass.baseTex = dotTexture()
      m.mainPass.depthWrite = false
      m.mainPass.baseColor = new vec4(1, 1, 1, ((l + 1) / TRAIL.levels) * alphaScale)
      mats.push(m)
    }
    const ribbon = new Ribbon(root, "TrailLine", RIBBON_SAMPLES, 4, LINE_EXTENT, LINE_CORE)
    const dots: Seg[] = []
    for (let i = 0; i < dotN; i++) {
      const obj = makeObj(root, "TrailDot_" + i)
      const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
      rmv.mesh = dotQuad()
      rmv.mainMaterial = mats[0]
      rmv.setRenderOrder(5)
      dots.push({obj, rmv, level: -1})
    }
    root.enabled = false
    return {root, ribbon, rgb: TRAIL_RGB.plane, dots, mats, alphaScale, boost: 1, widthScale: 1, opaque: false, lastS: NaN, dotS: [], dotElev: [], dotCount: 0, origin: null, dest: null, points: 0}
  }

  /** A fainter copy of the full trail (solid behind, dotted ahead, same gradient and width) for every vehicle, built once. */
  private buildAllRoutes(): void {
    const root = makeObj(this.sceneObject, "AllRoutes")
    this.routesRoot = root
    for (const m of this.markers) {
      const total = m.cum[m.cum.length - 1]
      const dotN = Math.min(DOT_POOL, Math.floor(total / (DOT_SPACING_DEG * DEG)))
      const t = this.makeTrailSet(root, "Route_" + m.info.id, dotN, ALL_ROUTE_ALPHA)
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

  /**
   * Day look of the route lines and trails (0 at night .. 1 by day), called from the preview backdrop's Time of Day update (never on a device). By day the lines are
   * 1.5x thicker, fully opaque (no glow), so they stand out from the bright sky; the COLOUR never changes (fixed per type). Cheap: only when the value moved a little.
   */
  setDayAmount(day: number): void {
    const d = Math.max(0, Math.min(1, day))
    if (Math.abs(d - this.dayAmt) < 0.02 && !((d === 0 || d === 1) && d !== this.dayAmt)) return
    this.dayAmt = d
    if (!this.built) return
    const sets: TrailSet[] = [this.main]
    for (const id in this.routeSets) sets.push(this.routeSets[id])
    for (const t of sets) {
      if (!t) continue
      this.tintTrail(t, t.rgb, t.boost) // colour + opacity of the ribbon and the dots
      t.lastS = NaN // the ribbon is laid again (new width) the next time the trail updates
      const dotCm = this.dotSizeCm()
      for (let k = 0; k < t.dotCount; k++) t.dots[k].obj.getTransform().setLocalScale(new vec3(dotCm, dotCm, dotCm))
    }
  }
  getDayAmount(): number { return this.dayAmt }
  private dotSizeCm(): number { return this.skyDomeRadiusCm * 2 * Math.tan((DOT_SIZE_DEG * DEG) / 2) } // one size at every time of day

  /** Ribbon + dot materials tinted for the object's type (alpha per level is fixed); `c` is the kind's fixed colour, the same day and night. */
  private tintTrail(t: TrailSet, c: vec3, boost: number): void {
    t.rgb = c
    t.boost = boost
    const col = [c.x, c.y, c.z]
    const op = routeOpacityMul(1) // dots: the same (day) brightness at every time of day
    t.ribbon.setColor(new vec4(col[0], col[1], col[2], 1))
    for (let l = 0; l < t.mats.length; l++) t.mats[l].mainPass.baseColor = new vec4(col[0], col[1], col[2], t.opaque ? (l + 1) / t.mats.length : Math.min(1, ((l + 1) / t.mats.length) * t.alphaScale * boost * op))
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
    const pinned = m.info.id === this.pinnedId
    if (this.trailId !== m.info.id || !this.main.root.enabled || this.mainPinned !== pinned) {
      this.trailId = m.info.id
      this.mainPinned = pinned
      this.main.root.enabled = true
      this.layoutTrail(this.main, m, pinned)
    }
    this.updateAllRoutesVisibility()
  }

  /** Fixed trail geometry along the route, built when a trail is shown. Nothing here depends on the vehicle's position. */
  private layoutTrail(t: TrailSet, m: Marker, pinned: boolean = false): void {
    const r = this.skyDomeRadiusCm
    const kind = m.info.kind
    const toLocal = (d: vec3) => d.uniformScale(r)
    t.widthScale = pinned ? PINNED_WIDTH : 1
    t.opaque = kind === "satellite"
    const total = m.cum[m.cum.length - 1]
    t.points = m.past.length + m.ahead.length
    t.origin = m.originTag ? toLocal(m.originTag) : null
    t.dest = m.destTag ? toLocal(m.destTag) : null
    // Selected state = a wider, slightly brighter trail; the colour itself stays the kind's colour.
    this.tintTrail(t, TRAIL_RGB[kind] ?? TRAIL_RGB.plane, pinned ? PINNED_BOOST : 1)
    t.lastS = NaN

    // Dots (planes and helicopters): fixed arc positions every DOT_SPACING_DEG from the route start. Everything sits on the
    // dome, so equal arc = equal viewing angle; each dot is DOT_SIZE_DEG across.
    t.dotS = []
    t.dotElev = []
    t.dotCount = 0
    {
      t.dotCount = Math.min(t.dots.length, Math.floor(total / (DOT_SPACING_DEG * DEG)))
      const dotCm = this.dotSizeCm()
      for (let k = 0; k < t.dotCount; k++) {
        const sk = (k + 1) * DOT_SPACING_DEG * DEG
        t.dotS.push(sk)
        t.dotElev.push(this.elevFade(pointAt(m.full, m.cum, sk).y))
        const d = t.dots[k]
        d.level = -1
        const dd = pointAt(m.full, m.cum, sk)
        d.obj.getTransform().setLocalPosition(toLocal(dd))
        d.obj.getTransform().setLocalRotation(quat.lookAt(dd.uniformScale(-1), Math.abs(dd.y) > 0.95 ? new vec3(1, 0, 0) : new vec3(0, 1, 0)))
        d.obj.getTransform().setLocalScale(new vec3(dotCm, dotCm, dotCm))
      }
    }
    for (let k = t.dotCount; k < t.dots.length; k++) t.dots[k].obj.enabled = false
    this.updateTrail(t, m)
  }

  /** Per frame: dot opacity; the ribbon is re-laid (spline, widths, fades) whenever the vehicle has moved a little. */
  private updateTrail(t: TrailSet, m: Marker): void {
    const r = this.skyDomeRadiusCm
    const kind = m.info.kind
    const total = m.cum[m.cum.length - 1]
    const s = m.s

    if (!(Math.abs(s - t.lastS) < RIBBON_REBUILD_DEG * DEG)) {
      t.lastS = s
      // The line starts behind the tail: half the glyph's drawn length (span x its distance scale) plus a small gap, so it never touches the marker.
      const gapCm = (this.glyphSpanCm * m.visual.getTransform().getLocalScale().x) / 2 + TRAIL.gapFromGlyphCm
      const x1 = s - gapCm / r
      if (x1 <= 0.002) {
        t.ribbon.setVisible(false)
      } else {
        const N = RIBBON_SAMPLES
        const pts: vec3[] = []
        const hw: number[] = []
        const al: number[] = []
        const halfW = (STROKE.at(r) * (TRAIL.widthMm / 1.5) * t.widthScale * routeWidthMul(this.dayAmt)) / 2
        const dayOp = routeOpacityMul(this.dayAmt)
        const cap = halfW * 2
        for (let i = 0; i < N; i++) {
          const x = (x1 * i) / (N - 1)
          const pd = splineAt(m.full, m.cum, x)
          pts.push(pd.uniformScale(r))
          const dEnd = Math.min(x, x1 - x) * r // cm to the nearest end: round cap
          const k = dEnd < cap ? Math.sqrt(Math.max(0, 1 - (1 - dEnd / cap) * (1 - dEnd / cap))) : 1
          hw.push(halfW * k)
          // Opacity depends on elevation only (smoothstep between fadeStartElevDeg and fadeEndElevDeg); the only other fade is the short
          // soft end where the line stops just short of the glyph.
          const tail = smoothstep01((x1 - x) / (RIBBON_END_FADE_DEG * DEG))
          if (t.opaque) { al.push(tail * (m.oldFadeRad > 0 ? smoothstep01(x / m.oldFadeRad) : 1) * this.elevFade(pd.y)); continue } // satellites: alpha 1.0, then the same tail + elevation (horizon) fade as every other trail
          const a = (TRAIL.peakBehind * tail) * (m.oldFadeRad > 0 ? smoothstep01(x / m.oldFadeRad) : 1)
          al.push(Math.min(1, a * this.elevFade(pd.y) * t.alphaScale * t.boost * dayOp))
        }
        t.ribbon.setVisible(true)
        t.ribbon.fill(pts, hw, al)
      }
    }
    // Ahead: dots stay anchored on the route and fade by elevation like the line. Each dot ramps out as the vehicle
    // closes in (full at DOT_FADE_FAR_DEG, gone at DOT_FADE_NEAR_DEG) so none ever overlaps the glyph.
    for (let k = 0; k < t.dotCount; k++) {
      const d = t.dots[k]
      const sk = t.dotS[k]
      if (sk <= s) { this.show(d, false); continue }
      const prox = smoothstep01(((sk - s) / DEG - DOT_FADE_NEAR_DEG) / (DOT_FADE_FAR_DEG - DOT_FADE_NEAR_DEG))
      this.put(t, d, t.opaque ? prox * t.dotElev[k] : TRAIL.peakAhead * prox * t.dotElev[k])
    }
  }

  /** 0..1 opacity from a unit direction's height: 1 at fadeStartElevDeg and above, smoothstep down to 0 at fadeEndElevDeg. */
  private elevFade(y: number): number {
    const el = Math.asin(Math.max(-1, Math.min(1, y))) / DEG
    return smoothstep01((el - this.fadeEndElevDeg) / Math.max(this.fadeStartElevDeg - this.fadeEndElevDeg, 0.01))
  }

  /** Show a trail piece at an alpha, hiding it when it is too faint for the lowest gradient level. */
  private put(t: TrailSet, s: Seg, alpha: number): void {
    if (alpha * t.mats.length < 0.5) {
      this.show(s, false)
      return
    }
    this.show(s, true)
    this.setLevel(t, s, alpha)
  }

  // ---------- per frame ----------
  private update(): void {
    if (!this.built) return
    const dt = getDeltaTime()
    const camPos = this.cameraObject.getTransform().getWorldPosition()
    this.sceneObject.getTransform().setWorldPosition(camPos)
    this.frameNo++
    if (this.birds) {
      if (!this.gazeCache || this.frameNo % 3 === 0) this.gazeCache = this.sceneObject.getTransform().getWorldRotation().invert().multiplyVec3(this.cameraObject.getTransform().getWorldRotation().multiplyVec3(new vec3(0, 0, -1))) // gaze direction in the sky root's frame (20 Hz is plenty for the birds' centre-of-view fade)
      this.birds.update(dt, this.gazeCache)
    }
    for (let mi = 0; mi < this.markers.length; mi++) {
      const m = this.markers[mi]
      // Markers drift a fraction of a degree per second: moving each at 20 Hz (staggered) looks identical and saves two thirds of the route maths; the aimed / pinned one stays per frame.
      m.acc += dt
      if ((this.frameNo + mi) % 3 === 0 || m.hovered || m.info.id === this.pinnedId) {
        this.moveMarker(m, m.acc)
        m.acc = 0
      }
      const want = m.hovered || m.info.id === this.pinnedId ? 1 : 0
      m.flash = Math.max(0, m.flash - dt * 0.8)
      const target = Math.max(want, m.flash)
      if (Math.abs(target - m.bright) > 0.002) {
        m.bright += (target - m.bright) * clamp01(dt * 10)
        setGlyphBrightness(m.glyph, m.color, m.bright)
        const s = m.distScale * (1 + 0.25 * m.bright)
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
      // Screen-aligned: the head's rotation, so up is locked to the head's up and the plane's rotation never leaks in.
      rt.setWorldRotation(this.cameraObject.getTransform().getWorldRotation())
    } else if (this.reticle.enabled) {
      this.reticle.enabled = false
    }
    this.updatePending()
    this.updatePendingEmpty()
  }

  private angleTo(m: Marker, origin: vec3, dir: vec3): number {
    const v = m.wrapper.getTransform().getWorldPosition().sub(origin).normalize()
    return Math.acos(Math.max(-1, Math.min(1, v.dot(dir.normalize())))) / DEG
  }

  /** Switching away from the current selection needs the newcomer to be this much closer (deg) to the pointer. */
  private static readonly SWITCH_MARGIN_DEG = 0.8
  /** The selection survives this long (s) after the pointer leaves it. */
  private static readonly KEEP_SECONDS = HOVER_KEEP_SECONDS

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
      // Snap to the vehicle nearest the pinch ray (closest to the ray, then nearest the camera); gaze when no hand ray is up.
      let ray: {o: vec3; d: vec3} | null = null
      for (const it of SIK.InteractionManager.getInteractorsByType(InteractorInputType.All)) {
        const d = it.direction
        const o = it.startPoint
        if (d && o && it.isActive()) { ray = {o, d}; break }
      }
      if (!ray) ray = {o: camPos, d: this.cameraObject.getTransform().getWorldRotation().multiplyVec3(new vec3(0, 0, -1))}
      if (this.frameNo - this.assistFrame >= 3) { // the 18-marker candidate list + sort is rebuilt at 20 Hz, not every frame
        this.assistFrame = this.frameNo
        const aim: AimCandidate[] = this.markers.map((m) => {
          const p = m.wrapper.getTransform().getWorldPosition()
          return {id: m.info.id, dir: p.sub(ray!.o).normalize(), distCm: p.distance(camPos)}
        })
        const pick = pickAimTarget(aim, ray.d, this.aimAssistDeg)
        this.assistPick = pick ? {id: pick.id, angleDeg: pick.angleDeg} : null
      }
      const pk = this.assistPick
      if (pk) cands.push({m: this.markerById[pk.id], ang: pk.angleDeg})
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
      } else if (now && !was && this.assistActive && !this.pending && !this.pendingEmpty && it.currentInteractable === null) {
        const d = it.direction
        this.pendingEmpty = {interactor: it, t0: getTime(), dir0: d ? d : vec3.forward()}
      }
      this.prevTrig.set(it, now)
    }
  }

  private updatePending(): void {
    const p = this.pending
    if (!p) return
    const elapsed = getTime() - p.t0
    const d = p.interactor.direction
    const moved = d ? rayMoveCm(p.dir0, d) : 0
    if (!p.interactor.isTriggering) {
      this.pending = null
      if (isTap(elapsed, moved)) this._onTap.invoke(p.m.info)
      else this.firePull(p.m, p.interactor) // anything slower or further is a drag / hold
      return
    }
    if (dragStarted(elapsed, moved)) {
      this.pending = null
      this.firePull(p.m, p.interactor)
    }
  }

  private updatePendingEmpty(): void {
    const p = this.pendingEmpty
    if (!p) return
    if (p.interactor.isTriggering) {
      if (getTime() - p.t0 >= TAP_MAX_SECONDS || p.interactor.currentInteractable !== null) this.pendingEmpty = null
      return
    }
    this.pendingEmpty = null
    const d = p.interactor.direction
    if (isTap(getTime() - p.t0, d ? rayMoveCm(p.dir0, d) : 0)) this._onTapEmpty.invoke()
  }

  private firePull(m: Marker, interactor: Interactor): void {
    this._onPullStart.invoke({info: m.info, interactor, worldPos: m.wrapper.getTransform().getWorldPosition()})
  }
}

// ---------- trail path helpers (unit directions on the sky dome) ----------

function smoothstep01(v: number): number {
  const x = Math.max(0, Math.min(1, v))
  return x * x * (3 - 2 * x)
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

/** Catmull-Rom point at arc position x (radians) along a dense route, re-projected onto the unit sphere. */
function splineAt(path: vec3[], cum: number[], x: number): vec3 {
  const n = path.length
  const xc = Math.max(0, Math.min(cum[n - 1], x))
  let lo = 0, hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= xc) lo = mid
    else hi = mid
  }
  const t = Math.max(0, Math.min(1, (xc - cum[lo]) / Math.max(cum[hi] - cum[lo], 1e-9)))
  const p0 = path[Math.max(lo - 1, 0)], p1 = path[lo], p2 = path[hi], p3 = path[Math.min(hi + 1, n - 1)]
  const t2 = t * t, t3 = t2 * t
  const c = (a: number, b: number, cc: number, d: number) =>
    0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3)
  return new vec3(c(p0.x, p1.x, p2.x, p3.x), c(p0.y, p1.y, p2.y, p3.y), c(p0.z, p1.z, p2.z, p3.z)).normalize()
}

// ---------- ribbon: one flat strip lying on the dome; opacity comes from a small texture (the shared unlit shader has no vertex colour) ----------

const TRAIL_TEX_MAT = requireAsset("../SkyHangar/Materials/SH_SkyTex.mat") as Material
const LINE_EXTENT = 0.72 // strip half width as a fraction of the nominal half width (about the visible width the old feathered line had)
const LINE_CORE = LINE_EXTENT // opaque across the whole strip: crisp solid edges, no soft outer line
const profileTex: {[key: string]: Texture} = {}

/** Texture whose alpha = u * edge(v): u carries the along-line opacity (set per vertex), v is across the strip (soft edge). */
function ribbonTexture(key: string, extent: number, coreEnd: number): Texture {
  if (profileTex[key]) return profileTex[key]
  const W = 256, H = 32
  const tex = ProceduralTextureProvider.createWithFormat(W, H, TextureFormat.RGBA8Unorm)
  const data = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y++) {
    const o = Math.abs((y + 0.5) / H - 0.5) * 2 * extent // distance from the centre, in core half widths
    const edge = 1 - smoothstep01((o - coreEnd) / Math.max(extent - coreEnd, 1e-6))
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4
      data[k] = 255
      data[k + 1] = 255
      data[k + 2] = 255
      data[k + 3] = Math.round(255 * (x / (W - 1)) * edge)
    }
  }
  ;(tex.control as ProceduralTextureProvider).setPixels(0, 0, W, H, data)
  profileTex[key] = tex
  return tex
}

let dotTex: Texture | null = null
/** Crisp round dot: white disc with a hard (one texel anti-aliased) edge. */
function dotTexture(): Texture {
  if (dotTex) return dotTex
  const N = 32
  const tex = ProceduralTextureProvider.createWithFormat(N, N, TextureFormat.RGBA8Unorm)
  const data = new Uint8Array(N * N * 4)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const r = Math.hypot((x + 0.5) / N - 0.5, (y + 0.5) / N - 0.5) * 2
      const k = (y * N + x) * 4
      data[k] = 255
      data[k + 1] = 255
      data[k + 2] = 255
      data[k + 3] = Math.round(255 * (1 - smoothstep01((r - 0.66) / 0.08)))
    }
  }
  ;(tex.control as ProceduralTextureProvider).setPixels(0, 0, N, N, data)
  dotTex = tex
  return tex
}

let dotQuadMesh: RenderMesh | null = null
/** Unit quad in the XY plane (centred), uv 0..1. */
function dotQuad(): RenderMesh {
  if (dotQuadMesh) return dotQuadMesh
  const b = new MeshBuilder([{name: "position", components: 3}, {name: "texture0", components: 2}])
  b.topology = MeshTopology.Triangles
  b.indexType = MeshIndexType.UInt16
  b.appendVerticesInterleaved([-0.5, -0.5, 0, 0, 0, 0.5, -0.5, 0, 1, 0, 0.5, 0.5, 0, 1, 1, -0.5, 0.5, 0, 0, 1])
  b.appendIndices([0, 1, 2, 0, 2, 3])
  b.updateMesh()
  dotQuadMesh = b.getMesh()
  return dotQuadMesh
}

function setRenderOrderDeep(o: SceneObject, order: number): void {
  for (const c of o.getComponents("Component.RenderMeshVisual")) (c as RenderMeshVisual).setRenderOrder(order)
  for (let i = 0; i < o.getChildrenCount(); i++) setRenderOrderDeep(o.getChild(i), order)
}

class Ribbon {
  private obj: SceneObject
  private rmv: RenderMeshVisual
  private mat: Material
  private b: MeshBuilder
  private n: number

  constructor(parent: SceneObject, name: string, n: number, order: number, extent: number, coreEnd: number) {
    this.n = n
    this.extent = extent
    this.obj = makeObj(parent, name)
    this.b = new MeshBuilder([{name: "position", components: 3}, {name: "texture0", components: 2}])
    this.b.topology = MeshTopology.Triangles
    this.b.indexType = MeshIndexType.UInt16
    const idx: number[] = []
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    this.b.appendIndices(idx)
    this.b.appendVerticesInterleaved(new Array(n * 2 * 5).fill(0))
    this.b.updateMesh()
    this.mat = TRAIL_TEX_MAT.clone()
    this.mat.mainPass.depthWrite = false
    this.mat.mainPass.baseTex = ribbonTexture(extent + ":" + coreEnd, extent, coreEnd)
    this.rmv = this.obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    this.rmv.mesh = this.b.getMesh()
    this.rmv.mainMaterial = this.mat
    this.rmv.setRenderOrder(order)
  }
  private extent: number

  setColor(c: vec4): void {
    this.mat.mainPass.baseColor = c
  }

  setVisible(on: boolean): void {
    if (this.obj.enabled !== on) this.obj.enabled = on
  }

  /** pts: dome-local positions; hw: core half width per sample (cm); alpha: per-sample opacity (0..1). */
  fill(pts: vec3[], hw: number[], alpha: number[]): void {
    const n = this.n
    const v: number[] = []
    for (let i = 0; i < n; i++) {
      const p = pts[i]
      const radial = p.normalize()
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(n - 1, i + 1)]
      let tan = next.sub(prev)
      tan = tan.length < 1e-6 ? new vec3(1, 0, 0) : tan.normalize()
      let side = tan.cross(radial)
      side = side.length < 1e-6 ? new vec3(1, 0, 0) : side.normalize()
      const w = this.extent * hw[i]
      const a = p.add(side.uniformScale(w)), c = p.sub(side.uniformScale(w))
      const u = Math.max(0, Math.min(1, alpha[i]))
      v.push(a.x, a.y, a.z, u, 0, c.x, c.y, c.z, u, 1)
    }
    this.b.eraseVertices(0, this.b.getVerticesCount())
    this.b.appendVerticesInterleaved(v)
    this.b.updateMesh()
  }
}

// ---------- gentle plane routes ----------

/** Unit tangent at P (on the sphere) pointing toward the direction of vector d. */
function tangentToward(P: vec3, d: vec3): vec3 {
  return d.sub(P.uniformScale(d.dot(P))).normalize()
}

/** One geodesic step of arc d from P heading T, then a turn of angle a about the new point. */
function stepOn(P: vec3, T: vec3, d: number, a: number): {P: vec3; T: vec3} {
  const P2 = P.uniformScale(Math.cos(d)).add(T.uniformScale(Math.sin(d))).normalize()
  let T2 = T.uniformScale(Math.cos(d)).sub(P.uniformScale(Math.sin(d)))
  T2 = T2.sub(P2.uniformScale(T2.dot(P2))).normalize()
  const T3 = T2.uniformScale(Math.cos(a)).add(P2.cross(T2).uniformScale(Math.sin(a))).normalize()
  return {P: P2, T: T3}
}

/**
 * A gentler copy of a plane route: the geodesic curvature is smoothed, blended toward straight, capped in rate and in
 * total turning, then re-integrated from the vehicle's own position (anchor), so the vehicle stays on its line.
 * Ends on an airport are pulled back to it; ends that run into the haze are trimmed / extended until they cross the
 * horizon, so a trail never stops in mid-sky.
 */
function gentleRoute(dirs: vec3[], anchor: number, groundStart: boolean, groundEnd: boolean): {dirs: vec3[]; anchor: number} {
  const n = dirs.length
  if (n < 5) return {dirs, anchor}
  const ds: number[] = []
  for (let i = 0; i < n - 1; i++) ds.push(Math.max(1e-7, Math.acos(Math.max(-1, Math.min(1, dirs[i].dot(dirs[i + 1]))))))
  // Geodesic curvature (rad turned per rad of arc) at each point: signed, + = turning left.
  const raw: number[] = new Array(n).fill(0)
  for (let i = 1; i < n - 1; i++) {
    const a = tangentToward(dirs[i], dirs[i].add(dirs[i].sub(dirs[i - 1])))
    const b = tangentToward(dirs[i], dirs[i + 1])
    raw[i] = Math.atan2(dirs[i].dot(a.cross(b)), a.dot(b)) / (0.5 * (ds[i - 1] + ds[i]))
  }
  const win = 12
  const c: number[] = []
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0
    for (let j = Math.max(1, i - win); j <= Math.min(n - 2, i + win); j++) { sum += raw[j]; cnt++ }
    const k = (cnt ? sum / cnt : 0) * GENTLE_BLEND
    c.push(Math.max(-MAX_TURN_RATE, Math.min(MAX_TURN_RATE, k)))
  }
  let turn = 0
  for (let i = 0; i < n - 1; i++) turn += Math.abs(c[i]) * ds[i]
  if (turn > MAX_TOTAL_TURN) for (let i = 0; i < n; i++) c[i] *= MAX_TOTAL_TURN / turn

  // Walk along the sphere from the anchor in both directions, turning by the capped curvature.
  const P0 = dirs[anchor]
  const T0 = tangentToward(P0, dirs[Math.min(n - 1, anchor + 1)].sub(dirs[Math.max(0, anchor - 1)]).add(P0))
  const fwd: vec3[] = []
  let cur = {P: P0, T: T0}
  for (let i = anchor; i < n - 1; i++) {
    cur = stepOn(cur.P, cur.T, ds[i], c[i + 1] * ds[i])
    fwd.push(cur.P)
  }
  const bwd: vec3[] = []
  cur = {P: P0, T: T0.uniformScale(-1)}
  for (let i = anchor; i > 0; i--) {
    cur = stepOn(cur.P, cur.T, ds[i - 1], -c[i - 1] * ds[i - 1])
    bwd.push(cur.P)
  }
  let out: vec3[] = bwd.reverse().concat([P0], fwd)
  let a = anchor

  // Ends on an airport: blend back to the true position over the outer stretch so the airport stays put.
  const sm = (v: number) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x) }
  for (let i = 0; i < n; i++) {
    let w = 0
    if (groundEnd && i > anchor) w = sm(((i - anchor) / Math.max(1, n - 1 - anchor) - 0.55) / 0.45)
    if (groundStart && i < anchor) w = sm(((anchor - i) / Math.max(1, anchor) - 0.55) / 0.45)
    if (w > 0) out[i] = vec3.lerp(out[i], dirs[i], w).normalize()
  }

  // Ends that run into the haze: trim at the horizon, or carry on straight until they reach it.
  if (!groundEnd) {
    let cut = -1
    for (let i = a + 1; i < out.length; i++) if (out[i].y < HORIZON_END_Y) { cut = i; break }
    if (cut > 0) out = out.slice(0, cut + 1)
    else {
      let P = out[out.length - 1]
      let T = tangentToward(P, P.add(P.sub(out[out.length - 2])))
      for (let k = 0; k < 4000 && P.y >= HORIZON_END_Y; k++) {
        const nx = stepOn(P, T, EXTEND_STEP, 0)
        P = nx.P
        T = nx.T
        out.push(P)
      }
    }
  }
  if (!groundStart) {
    let cut = -1
    for (let i = a - 1; i >= 0; i--) if (out[i].y < HORIZON_END_Y) { cut = i; break }
    if (cut >= 0) {
      out = out.slice(cut)
      a -= cut
    } else {
      const pre: vec3[] = []
      let P = out[0]
      let T = tangentToward(P, P.add(P.sub(out[1])))
      for (let k = 0; k < 4000 && P.y >= HORIZON_END_Y; k++) {
        const nx = stepOn(P, T, EXTEND_STEP, 0)
        P = nx.P
        T = nx.T
        pre.push(P)
      }
      out = pre.reverse().concat(out)
      a += pre.length
    }
  }
  return {dirs: out, anchor: a}
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
  if (info.kind === "helicopter") return clampDeg(kmPerSec * HELI_ROUTE_DEG_PER_KM * DEG, HELI_DEG_PER_SEC)
  const ap = AIRPORTS[info.destination]
  const remKm = ap ? haversineKm(info.lat, info.lon, ap.lat, ap.lon) : kmPerSec * info.arrivingInMin * 60
  const radPerKm = remKm > 1 ? aheadRad / remKm : HELI_DEG_PER_KM * DEG
  return clampDeg(kmPerSec * radPerKm, PLANE_DEG_PER_SEC)
}
