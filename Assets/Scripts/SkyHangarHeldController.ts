// SkyHangarHeldController.ts
// Owns: the "toy in your hand" — the 3D model pulled out of the sky, the two pads that fade in while
// you hold it (Hangar pad = collect, Sky pad = send it back to its place in the sky), collect-on-pad,
// return-to-sky, and the scripted throw-and-return path (helicopter rotors spin).
// States: none -> flyingIn -> held -> (collecting | returningToSky | thrown -> returning -> resting).
// Inspect from the hangar (beginInspect): a shelf model is pulled into the hand the same way; releasing over the
// Sky pad sends it to the sky (and out of the collection); a slow release returns it to its shelf slot
// (state returningToShelf) only if the hand lets go before arrival; any other release is thrown like a sky model (thrown -> returning) but curves back to its slot.
// While resting the model can be grabbed again (drag to a pad / throw) or quick-tapped to turn it.
// Expects @inputs: camera object, the sky controller (PartKit + marker positions).
// Emits onCollected / onThrown / onReturned / onSentToSky. Must not: show text or own the shelf.

import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {ElementContent} from "SpectaclesUIKit.lspkg/Scripts/Components/Content/ElementContent"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import {Interactor, InteractorInputType} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"
import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {SkyObjectInfo} from "./SkyHangarFlightData"
import {buildModel, BuiltModel, spinRotors, styleFor} from "./SkyHangarModelFactory"
import {SkyHangarSkyController} from "./SkyHangarSkyController"
import {glassPanel, glassSurface, obj, PALETTE, setRenderOrderTree, UI_RENDER_ORDER} from "./SkyHangarSharedUI"
import {
  PartKit, makeObj, yawOf, yawOffset, yawRotation, faceDir, easeOutCubic, easeInOut, bezier3, flatForward, flatRight, clamp01, DEG
} from "./SkyHangarUtil"
import {TAP_REF_DISTANCE_CM, dragStarted, isTap, rayMoveCm as rayMove} from "./SkyHangarInput"

export type HeldState = "none" | "flyingIn" | "held" | "viewing" | "collecting" | "returningToSky" | "returningToShelf" | "thrown" | "returning" | "resting"
export type ReleaseTarget = "hangar" | "sky" | "throw" | "shelf"

/** Hooks the main script gives a hangar inspect (the held controller does not know the shelf). */
export interface InspectHooks {
  /** World position of the model's shelf slot (also brings its page into view). */
  slotPos: () => vec3 | null
  /** World position of the shelf centre, for "released over the shelf". */
  shelfPos: () => vec3
  /** Diameter of a model on the shelf, cm (the hand model scales to and from it). */
  shelfSpanCm: number
  /** The model is back in its slot. */
  onReturned: () => void
  /** The model was sent to the sky (it leaves the collection). */
  onSentToSky: () => void
}

const ICON_SKY = requireAsset("../Icons/cloud.png") as Texture
const ICON_HANGAR = requireAsset("../Icons/warehouse.png") as Texture

interface Pad {
  root: SceneObject
  accent: SceneObject
  content: ElementContent
  lastTint: number
  color: vec4
  alpha: number
  glow: number
  over: boolean
  /** Seconds the held model has stayed inside the capture radius (the pad reacts after PAD_DWELL_SECONDS). */
  dwell: number
  /** Seconds-fraction (0..1) of the one-off confirmation pulse; -1 = idle. */
  pulse: number
}

const PAD_DWELL_SECONDS = 0.3
/** Round glass pads: 10 cm across, 0.8 m ahead, slightly below eye level, Hangar left and Sky right. */
const PAD_DIAMETER_CM = 10
const PAD_HIT_SCALE = 1.25 // hit radius = drawn radius x this (must stay <= 1.3)
/** Longest dimension of the model in the hand, cm (at the hold distance). */
const HELD_SPAN_PLANE_CM = 15
const HELD_SPAN_HELI_CM = 12
const HELD_SPAN_SAT_CM = 10
/** Rests centred between the two pads (pads are at x +-16 cm at 80 cm; this is at 58 cm), clear of them and of the menu bar. */
const HAND_OFFSET = new vec3(0, -4, -58)
/** Release motion timings, seconds. Throw total = glide + U-turn return. */
const THROW_GLIDE_SECONDS = 1.2
const THROW_RETURN_SECONDS = 2.5
const SKY_RETURN_SECONDS = 1.5
const COLLECT_SECONDS = 1.1
/** Safety: icons that are open with nothing held / flying toward them are force-closed after this long. */
const ICON_STUCK_SECONDS = 1.5
/** Bank (roll) limit and gain for planes gliding into an icon; helicopters lean gently instead, satellites never bank. */
const GLIDE_BANK_MAX = 0.7
const GLIDE_BANK_GAIN = 0.22
const HELI_TILT_RAD = 0.16
/** Sideways reach of the U-turn control point, cm (gives a turn radius of roughly 0.6 - 1 m). */
const TURN_WIDTH_CM = 240
const THROW_MIN_SPEED_CM = 180
/** Fraction of the release speed still left when the glide hands over to the U-turn. */
const GLIDE_END_SPEED = 0.35
/** Inspect mode: the model hangs 40 cm ahead of the eyes and turns slowly. */
const VIEW_OFFSET = new vec3(0, -2, -40)
const VIEW_DISTANCE_CM = 40
const VIEW_TURN_RAD_PER_S = 0.5
const SAT_TILT_RAD = 40 * DEG // held / inspected satellites lean their flat panel face toward the viewer
/** Render order above the pad band (pad glass, glow and icon all sit in UI_RENDER_ORDER + a few). */
const HELD_MODEL_ORDER = 400
const PAD_OFFSET_HANGAR = new vec3(-16, -5, -80)
const PAD_OFFSET_SKY = new vec3(16, -5, -80)

@component
export class SkyHangarHeldController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarHeldController – pull, pads, collect, sky return, throw</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("The main camera SceneObject (the user's head)")
  cameraObject!: SceneObject
  @input
  @hint("Sky controller — provides the shared primitive kit and marker positions")
  sky!: SkyHangarSkyController
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Width of the pulled model in cm")
  @widget(new SliderWidget(10, 40, 1))
  modelSpanCm: number = 25
  @input("vec3", "{-9, -21, -48}")
  @hint("Where the model rests in your hand: x right, y up, z (negative = ahead) from the eyes, cm")
  handOffset: vec3 = new vec3(-9, -21, -48)
  @input("vec3", "{11, -24, -50}")
  @hint("Hangar pad position relative to the eyes (to the right of the hand), cm")
  padOffset: vec3 = new vec3(11, -24, -50)
  @input("vec3", "{12, -6, -54}")
  @hint("Sky return pad position relative to the eyes (above the hangar pad, toward the sky), cm")
  skyPadOffset: vec3 = new vec3(12, -6, -54)
  @input
  @hint("Pad diameter, cm")
  @widget(new SliderWidget(10, 40, 1))
  padDiameterCm: number = 20
  @input
  @hint("Model counts as 'over a pad' within this distance of its centre, cm")
  @widget(new SliderWidget(5, 30, 1))
  padCaptureCm: number = 9
  @input
  @hint("Distance from the eyes at which a held model follows your pinch ray, cm")
  @widget(new SliderWidget(30, 90, 1))
  holdDistanceCm: number = 58
  @input
  @hint("Seconds for the model to slide down from the sky into your hand")
  @widget(new SliderWidget(0.2, 2, 0.05))
  flyInSeconds: number = 0.8
  @input
  @hint("Seconds for the model to fly back to its place in the sky")
  @widget(new SliderWidget(0.3, 3, 0.05))
  skyReturnSeconds: number = 1.1
  @input
  @hint("Seconds a thrown model glides along its release direction before curving back")
  @widget(new SliderWidget(0.8, 4, 0.1))
  throwSeconds: number = 2
  @input
  @hint("Seconds for the curve back to the hand")
  @widget(new SliderWidget(0.5, 3, 0.1))
  returnSeconds: number = 1.2
  @input
  @hint("Fastest a throw can leave the hand, cm/s")
  @widget(new SliderWidget(100, 600, 10))
  throwMaxSpeedCm: number = 350
  @input("vec4", "{0.45, 0.75, 1.0, 1.0}")
  @hint("Hangar pad colour (calm accent blue)")
  @widget(new ColorWidget())
  hangarPadColor: vec4 = new vec4(0.45, 0.75, 1.0, 1.0)
  @input("vec4", "{0.85, 0.95, 1.0, 1.0}")
  @hint("Sky pad colour")
  @widget(new ColorWidget())
  skyPadColor: vec4 = new vec4(0.85, 0.95, 1.0, 1.0)
  @ui.group_end

  private kit!: PartKit
  private state: HeldState = "none"
  private info: SkyObjectInfo | null = null
  private model: BuiltModel | null = null
  private holder!: SceneObject // collider wrapper (unit scale, identity)
  private interactable!: Interactable
  private holderCollider!: ColliderComponent // only live while the model rests or hangs in inspect mode: a gliding model must never catch pinch rays meant for the shelf
  private interactor: Interactor | null = null
  private t = 0
  private fromPos = vec3.zero()
  private fromScale = 1
  private yawAtPull = 0
  private spinYaw = 0
  private spinTarget = 0
  private satTilt = 0 // 0..1 ease of the satellite pitch toward the viewer
  private samples: {pos: vec3; time: number}[] = []
  private throwVel = vec3.zero()
  private throwPos = vec3.zero()
  private grabT0 = 0
  private grabDir0 = vec3.forward()
  private grabPending = false
  private lastWasScripted = false
  private inspect: InspectHooks | null = null
  private overShelf = false
  private fromRot = quat.quatIdentity()
  private collectPulsed = false
  // throw flight: glide direction / speed, U-turn control points, smoothed heading and bank
  private throwDir = vec3.forward()
  private throwSpeed0 = 0
  private turnC1 = vec3.zero()
  private turnSide = vec3.right()
  private heading = quat.quatIdentity()
  private lastDir = vec3.forward()
  private bank = 0
  private rotBlend = 0
  private fadeMats: {mat: Material; color: vec4}[] = []
  // glide into an icon (collect / send to sky): curved path leaving along the current heading
  private glideC1 = vec3.zero()
  private glideHeading0 = vec3.forward()
  private glideClock = 0 // real seconds spent in the current glide (watchdog)
  private iconIdleT = 0 // seconds the icons have been open with no reason to be
  // inspect mode: where the model came from, and the empty-space tap being timed
  private viewOrigin: "" | "shelf" | "sky" = ""
  private emptyTap: {it: Interactor; t0: number; dir0: vec3} | null = null
  private prevTrig = new Map<Interactor, boolean>()

  private hangarPad!: Pad
  private skyPad!: Pad

  private _onCollected = new Event<SkyObjectInfo>()
  private _onThrown = new Event<SkyObjectInfo>()
  private _onReturned = new Event<SkyObjectInfo>()
  private _onPulled = new Event<SkyObjectInfo>()
  private _onSentToSky = new Event<SkyObjectInfo>()
  get onCollected(): PublicApi<SkyObjectInfo> { return this._onCollected.publicApi() }
  get onThrown(): PublicApi<SkyObjectInfo> { return this._onThrown.publicApi() }
  get onReturned(): PublicApi<SkyObjectInfo> { return this._onReturned.publicApi() }
  get onPulled(): PublicApi<SkyObjectInfo> { return this._onPulled.publicApi() }
  get onSentToSky(): PublicApi<SkyObjectInfo> { return this._onSentToSky.publicApi() }

  onAwake(): void {
    if (!this.cameraObject || !this.sky) {
      print("SkyHangarHeldController: required @input not wired")
      return
    }
    this.createEvent("OnStartEvent").bind(() => this.build())
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  // ---------- public API ----------
  getState(): HeldState { return this.state }
  getHeldId(): string { return this.info && this.state !== "none" ? this.info.id : "" }
  getHeldInfo(): SkyObjectInfo | null { return this.state !== "none" ? this.info : null }
  getHeldKind(): string { return this.info && this.state !== "none" ? this.info.kind : "" }
  isPadVisible(): boolean { return this.padVisible(this.hangarPad) }
  isPadGlowing(): boolean { return this.hangarPad && this.hangarPad.over && this.state === "held" }
  isSkyPadVisible(): boolean { return this.padVisible(this.skyPad) }
  isSkyPadGlowing(): boolean { return this.skyPad && this.skyPad.over && this.state === "held" }
  isRotorSpinning(): boolean { return !!(this.model && this.model.mainRotor && this.state !== "none") }
  getModelObject(): SceneObject | null { return this.state !== "none" ? this.holder : null }
  getModelWorldPos(): vec3 { return this.holder.getTransform().getWorldPosition() }
  getPadWorldPos(): vec3 { return this.hangarPad.root.getTransform().getWorldPosition() }
  getSkyPadWorldPos(): vec3 { return this.skyPad.root.getTransform().getWorldPosition() }
  /** Label spot under a pad, on the pad's own axes (centred under it, same rotation). */
  getPadLabelPose(sky: boolean): {pos: vec3; rot: quat} {
    const t = (sky ? this.skyPad : this.hangarPad).root.getTransform()
    const rot = t.getWorldRotation()
    return {pos: t.getWorldPosition().add(rot.multiplyVec3(new vec3(0, -this.padDiameterCm * 0.6, 0.4))), rot}
  }
  getHandWorldPos(): vec3 { return this.handPos(this.yawAtPull) }
  /** Pad label alpha (0..1) for the UI layer. */
  getPadAlpha(): number { return this.hangarPad ? this.hangarPad.alpha : 0 }

  /** Start pulling an object out of the sky. interactor may be null for scripted/test pulls. */
  beginPull(info: SkyObjectInfo, fromWorld: vec3, interactor: Interactor | null): void {
    if (!this.holder) return
    // A new pull while the last model is still gliding into an icon: land it first (never lose a collect / sky return, never leave an icon open).
    if (this.state === "collecting") this.completeCollect()
    else if (this.state === "returningToSky") this.completeSkyReturn()
    this.clearModel()
    this.resetHeldFlags()
    this.lastWasScripted = false
    this.info = info
    this.interactor = interactor
    this.modelSpanCm = info.kind === "helicopter" ? HELD_SPAN_HELI_CM : info.kind === "satellite" ? HELD_SPAN_SAT_CM : HELD_SPAN_PLANE_CM
    const sph = this.holder.getComponent("Physics.ColliderComponent") as ColliderComponent | null
    if (sph) { const sh = Shape.createSphereShape(); sh.radius = this.modelSpanCm * 0.55; sph.shape = sh }
    this.yawAtPull = this.camYaw()
    const visual = makeObj(this.holder, "HeldVisual")
    this.model = buildModel(this.kit, visual, "Model_" + info.id, info.kind, this.modelSpanCm, styleFor(info.colors, info.kind, true, info.airlineIcao || info.id), info.aircraftType, info.id, !info.airlineIcao)
    setRenderOrderTree(visual, UI_RENDER_ORDER + HELD_MODEL_ORDER) // layering: pad, then pad icon, then the model on top
    this.holder.enabled = true
    this.fromPos = fromWorld
    this.fromScale = 1.6
    this.t = 0
    this.spinYaw = 0
    this.spinTarget = 0
    this.satTilt = 0
    this.setState("flyingIn")
    this._onPulled.invoke(info)
  }

  /** Scripted pull that ends "held" (no interactor) so tests can then release over/away from a pad. */
  beginScriptedPull(info: SkyObjectInfo, fromWorld: vec3): void {
    this.beginPull(info, fromWorld, null)
    this.lastWasScripted = true
  }

  /** Scripted shelf pull that ends "held" (no interactor), for tests. */
  beginScriptedInspect(info: SkyObjectInfo, fromWorld: vec3, hooks: InspectHooks): void {
    this.beginInspect(info, fromWorld, null, hooks)
    this.lastWasScripted = true
  }

  /** Pull a model off the hangar shelf into the hand (to inspect it). Same hold / rotate / pad behaviour as a sky pull. */
  beginInspect(info: SkyObjectInfo, fromWorld: vec3, interactor: Interactor | null, hooks: InspectHooks): void {
    this.beginPull(info, fromWorld, interactor)
    this.inspect = hooks
    this.fromScale = hooks.shelfSpanCm / this.modelSpanCm
  }

  /** True while the model in the hand came from the hangar shelf. */
  isInspecting(): boolean { return this.inspect !== null && this.state !== "none" }

  /** True while a model hangs in inspect mode (40 cm ahead, slowly turning). */
  isViewing(): boolean { return this.state === "viewing" }
  /** Where the model out now was taken from when it entered inspect mode ("" = pulled by hand). */
  getViewOrigin(): "" | "shelf" | "sky" { return this.state !== "none" ? this.viewOrigin : "" }

  /** Send a shelf model (hooks) or a sky model (hooks null) to inspect mode in front of the user. */
  beginView(info: SkyObjectInfo, fromWorld: vec3, hooks: InspectHooks | null): void {
    this.beginPull(info, fromWorld, null)
    this.viewOrigin = hooks ? "shelf" : "sky"
    if (hooks) {
      this.inspect = hooks
      this.fromScale = hooks.shelfSpanCm / this.modelSpanCm
    }
  }

  /**
   * A new pickup while the last Hangar model is still gliding home: land it in its slot now, so every model can be picked up
   * immediately (the glide used to block pickups for up to 0.9 s). Returns true if a return was finished.
   */
  finishShelfReturn(): boolean {
    const gliding = this.state === "returningToShelf" || ((this.state === "thrown" || this.state === "returning") && this.inspect !== null)
    if (!gliding) return false
    const hooks = this.inspect
    const info = this.info
    const wasReturning = this.state === "returning"
    this.clearModel()
    if (wasReturning && info) this._onReturned.invoke(info)
    if (hooks) hooks.onReturned()
    return true
  }

  /** Leave inspect mode: a shelf model returns smoothly to its slot, a sky model to its place in the sky. */
  endView(): boolean {
    if (this.state !== "viewing") return false
    this.interactor = null
    this.grabPending = false
    this.emptyTap = null
    if (this.viewOrigin === "shelf") {
      this.startShelfReturn()
      this.overShelf = false // always the smooth return, never the quick settle
    } else this.startSkyReturn()
    return true
  }

  /**
   * Release the held model. overPad: null = use the real position; true = hangar pad; false = throw;
   * "sky" = the Sky return pad (tests / automation).
   */
  release(overPad: boolean | "sky" | null = null): void {
    if (this.state !== "held" && this.state !== "flyingIn") return
    this.interactor = null
    if (this.state === "flyingIn" && overPad === null) return // let go before arrival: settles into the hand
    let target: ReleaseTarget
    if (this.inspect) {
      // From the hangar: the Sky pad sends it away; (after inspect mode) the Hangar pad returns it to its slot;
      // anywhere else is a free throw that glides back to its shelf slot.
      if (overPad === "sky" || (overPad === null && this.skyPad.over)) target = "sky"
      else if (this.viewOrigin === "shelf" && (overPad === true || (overPad === null && this.hangarPad.over))) target = "shelf"
      else target = "throw"
    } else if (overPad === null) target = this.hangarPad.over ? "hangar" : this.skyPad.over ? "sky" : "throw"
    else if (overPad === "sky") target = "sky"
    else target = overPad ? "hangar" : "throw"
    if (target === "hangar") this.startCollect()
    else if (target === "sky") this.startSkyReturn()
    else if (target === "shelf") this.startShelfReturn()
    else this.startThrow()
  }

  /** Send whatever model is out (held or resting in the hand) back to the sky — e.g. when released over the Sky return pad. */
  sendToSky(): boolean {
    if (this.state === "none" || this.state === "collecting" || this.state === "returningToSky" || this.state === "returningToShelf") return false
    this.interactor = null
    this.startSkyReturn()
    return true
  }

  /** Programmatically move the held model over the hangar pad (tests / automation). */
  moveOverPad(): void {
    if (this.state !== "held") return
    this.interactor = null
    this.holder.getTransform().setWorldPosition(this.getPadWorldPos().add(new vec3(0, 6, 0)))
    this.hangarPad.over = true
    this.skyPad.over = false
  }

  /** Programmatically move the held model over the Sky pad (tests / automation). */
  moveOverSkyPad(): void {
    if (this.state !== "held") return
    this.interactor = null
    this.holder.getTransform().setWorldPosition(this.getSkyPadWorldPos().add(new vec3(0, 3, 3)))
    this.skyPad.over = true
    this.hangarPad.over = false
  }

  // ---------- build ----------
  private build(): void {
    this.kit = this.sky.partKit
    this.handOffset = HAND_OFFSET // the scene still serialises older values
    this.padDiameterCm = PAD_DIAMETER_CM // the scene still serialises an older, much larger value
    this.throwSeconds = THROW_GLIDE_SECONDS // release timings are fixed here, not by the serialised scene values
    this.returnSeconds = THROW_RETURN_SECONDS
    this.skyReturnSeconds = SKY_RETURN_SECONDS
    this.holder = makeObj(this.sceneObject, "HeldModel")
    const collider = this.holder.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createSphereShape()
    shape.radius = this.modelSpanCm * 0.55
    collider.shape = shape
    collider.fitVisual = false
    this.holderCollider = collider
    this.interactable = this.holder.createComponent(Interactable.getTypeName()) as Interactable
    this.interactable.onTriggerStart.add((e: InteractorEvent) => this.onGrab(e))
    this.holder.enabled = false
    this.hangarPad = this.buildPad("HangarPad", this.hangarPadColor, ICON_HANGAR)
    this.skyPad = this.buildPad("SkyReturnPad", this.skyPadColor, ICON_SKY)
  }

  /** Round glass pad in the menu-button style: glass disc, accent disc that lights on hover, the menu bar's icon. */
  private buildPad(name: string, color: vec4, icon: Texture): Pad {
    const root = makeObj(this.sceneObject, name)
    const d = this.padDiameterCm
    glassSurface(root, "PadGlass", new vec2(d, d), {radiusCm: d, fill: 0.67, rim: 0.7})
    const acc = glassPanel(root, "PadActive", new vec2(d * 1.04, d * 1.04), {tint: new vec4(0.3, 0.62, 1.0, 0.96), glow: new vec4(0.7, 0.88, 1, 0.35), edge: new vec4(1, 1, 1, 0.95), edgeCm: 0.2, radiusCm: d})
    acc.so.getTransform().setLocalPosition(new vec3(0, 0, 0.04))
    acc.so.getTransform().setLocalScale(vec3.zero())
    // Icon built exactly like the menu bar buttons: a Ghost UIKit Button with an ElementContent leading icon.
    const so = obj(root, "PadIconButton", new vec3(0, 0, 0.1))
    const btn = so.createComponent(Button.getTypeName()) as Button
    btn.setVariant({theme: "SnapOS2", shape: "Round", style: "Ghost"})
    btn.size = new vec3(d, d, 1)
    const ec = so.createComponent(ElementContent.getTypeName()) as ElementContent
    ec.leadingIcon = icon
    ec.iconLayout = "left"
    ec.leadingIconSize = d * 0.5
    const ecAny = ec as any
    ecAny._useThemeColors = false
    // Pads are display only: the Button must not catch the pinch ray.
    const col = so.getComponent("Physics.ColliderComponent") as ColliderComponent | null
    if (col) col.enabled = false
    const it = so.getComponent(Interactable.getTypeName()) as Interactable | null
    if (it) it.enabled = false
    this.tintPad({content: ec, lastTint: -1} as Pad, 0, 0)
    root.enabled = false
    return {root, accent: acc.so, content: ec, lastTint: -1, color, alpha: 0, glow: 0, over: false, dwell: 0, pulse: -1}
  }

  /** Icon tint (white, alpha follows the pad's fade; brighter while the held model hovers it). */
  private tintPad(p: Pad, alpha: number, glow: number): void {
    const a = Math.round(alpha * (0.85 + 0.15 * glow) * 100) / 100
    if (a === p.lastTint) return
    p.lastTint = a
    const ecAny = p.content as any
    const t = new vec4(1, 1, 1, a)
    ecAny._defaultIconTint = t
    ecAny._hoveredIconTint = t
    ecAny._triggeredIconTint = t
    ecAny._inactiveIconTint = t
    p.content.markColorsDirty()
  }

  // ---------- helpers ----------
  private padVisible(p: Pad | undefined): boolean { return !!p && p.root.enabled && p.alpha > 0.05 }
  private camPos(): vec3 { return this.cameraObject.getTransform().getWorldPosition() }
  private camForward(): vec3 { return this.cameraObject.getTransform().getWorldRotation().multiplyVec3(new vec3(0, 0, -1)) }
  private camYaw(): number { return yawOf(this.camForward()) }
  private handPos(yaw: number): vec3 { return yawOffset(this.camPos(), yaw, this.handOffset) }
  private padPos(yaw: number): vec3 { return yawOffset(this.camPos(), yaw, PAD_OFFSET_HANGAR) }
  /** Render order for the two pads (UI layer, in front of the world-space sky). */
  applyUiOrder(order: number): void {
    for (const p of [this.hangarPad, this.skyPad]) if (p) setRenderOrderTree(p.root, order)
  }

  private skyPadPos(yaw: number): vec3 { return yawOffset(this.camPos(), yaw, PAD_OFFSET_SKY) }
  /** Distance from the pad centre to the held model projected onto the pad's own depth (so hold depth does not matter). */
  private padMiss(model: vec3, pad: vec3): number {
    const eye = this.camPos()
    const dir = model.sub(eye).normalize()
    return eye.add(dir.uniformScale(pad.sub(eye).length)).distance(pad)
  }

  private rayHoldPoint(it: Interactor): vec3 | null {
    const s = it.startPoint
    const d = it.direction
    if (!s || !d) return null
    const eye = this.camPos()
    const far = s.add(d.normalize().uniformScale(200))
    const dir = far.sub(eye).normalize()
    return eye.add(dir.uniformScale(this.holdDistanceCm))
  }

  private setState(s: HeldState): void {
    this.state = s
    // Icons are visible only while an aircraft is held / dragged. The moment the hold ends they close in the same frame, before any
    // throw / return motion starts (no fade-out from full opacity). The one icon a glide flies into stays until it arrives.
    const showing = s === "held" || (s === "flyingIn" && !this.viewOrigin)
    if (!showing) {
      if (s !== "collecting") this.hidePad(this.hangarPad)
      if (s !== "returningToSky") this.hidePad(this.skyPad)
    }
    if (this.holderCollider) this.holderCollider.enabled = s === "resting" || s === "viewing"
    if (s === "held") this.samples = []
    if (s === "viewing") {
      this.prevTrig.clear()
      this.emptyTap = null
      this.grabPending = false
    }
  }

  private viewPos(yaw: number): vec3 { return yawOffset(this.camPos(), yaw, VIEW_OFFSET) }

  /** Movement of the pinch ray since dir0, in cm at the inspect distance. */
  private rayMoveCm(it: Interactor, dir0: vec3): number {
    const d = it.direction
    return d ? rayMove(dir0, d, TAP_REF_DISTANCE_CM) : 0
  }

  /** Inspect mode input: a pinch on the model is a tap (< 0.15 s, < 1 cm) or the start of a drag; a tap on empty space also leaves. */
  private updateViewInput(): void {
    if (this.grabPending && this.interactor) {
      const it = this.interactor
      const elapsed = getTime() - this.grabT0
      const moved = this.rayMoveCm(it, this.grabDir0)
      if (!it.isTriggering) {
        this.grabPending = false
        this.interactor = null
        if (isTap(elapsed, moved)) this.endView()
        return
      }
      if (dragStarted(elapsed, moved)) {
        this.grabPending = false
        this.lastWasScripted = false
        this.yawAtPull = this.camYaw()
        this.setState("held") // a drag: the pads appear and the release works as for any held model
      }
      return
    }
    for (const it of SIK.InteractionManager.getInteractorsByType(InteractorInputType.All)) {
      const now = it.isTriggering
      const was = this.prevTrig.get(it) ?? false
      this.prevTrig.set(it, now)
      if (now && !was) {
        const d = it.direction
        this.emptyTap = it.currentInteractable === null && d ? {it, t0: getTime(), dir0: d} : null
      } else if (!now && was && this.emptyTap && this.emptyTap.it === it) {
        const tap = this.emptyTap
        this.emptyTap = null
        if (isTap(getTime() - tap.t0, this.rayMoveCm(it, tap.dir0))) {
          this.endView()
          return
        }
      }
    }
  }

  /** Everything that must not leak from one hold into the next. */
  private resetHeldFlags(): void {
    this.interactor = null
    this.grabPending = false
    this.samples = []
    this.overShelf = false
    for (const p of [this.hangarPad, this.skyPad]) {
      if (p) { p.over = false; p.dwell = 0 }
    }
  }

  private clearModel(): void {
    if (this.model && !isNull(this.model.root)) {
      const v = this.model.root.getParent()
      if (v && !isNull(v)) v.destroy()
    }
    this.model = null
    this.fadeMats = []
    this.rotBlend = 0
    this.satTilt = 0
    this.state = "none"
    this.inspect = null
    this.viewOrigin = ""
    this.emptyTap = null
    this.overShelf = false
    this.interactor = null
    this.grabPending = false
    this.closeIcons(false) // every exit path (collect, sky, shelf, throw return) ends here: both icons stop hovering and fade out
    if (this.holder) this.holder.enabled = false
  }

  private onGrab(e: InteractorEvent): void {
    if (this.state !== "resting" && this.state !== "viewing") return
    this.interactor = e.interactor
    this.grabT0 = getTime()
    const d = e.interactor.direction
    this.grabDir0 = d ? d : vec3.forward()
    this.grabPending = true
  }

  private startCollect(): void {
    this.setState("collecting")
    this.t = 0
    this.collectPulsed = false
    this.beginGlide(this.padPos(this.yawAtPull))
  }

  private startSkyReturn(): void {
    this.setState("returningToSky")
    this.t = 0
    this.glideClock = 0
    this.fromPos = this.holder.getTransform().getWorldPosition()
    this.captureRotation()
  }

  /** Common start of a glide into an icon: remember where it leaves from and which way the nose points. */
  private beginGlide(iconPos: vec3): void {
    this.t = 0
    this.glideClock = 0
    this.collectPulsed = false
    this.fromPos = this.holder.getTransform().getWorldPosition()
    this.captureRotation()
    this.prepareFade()
    const toIcon = iconPos.sub(this.fromPos)
    const dirToIcon = toIcon.length > 0.01 ? toIcon.normalize() : this.camForward()
    // Leave along the way the model already points (nose = -Z); if it is held side-on, lean it toward the icon.
    let nose = this.fromRot.multiplyVec3(new vec3(0, 0, -1))
    if (nose.length < 0.01) nose = dirToIcon
    nose = nose.normalize()
    const v = this.releaseVelocity()
    let h = nose.uniformScale(0.5).add(dirToIcon.uniformScale(0.5))
    if (v.length > 40) h = h.add(v.normalize().uniformScale(0.6))
    this.glideHeading0 = h.length > 0.01 ? h.normalize() : dirToIcon
    this.heading = this.fromRot // eases from the hand pose into the flight, never snaps
    this.lastDir = this.glideHeading0
    this.bank = 0
    this.samples = []
  }

  /**
   * One frame of the glide into an icon. A cubic Bezier from the current spot (leaving along the current heading) to just past the icon,
   * smootherstep speed (slow start, brief acceleration, gentle deceleration), nose along the tangent with a smoothed heading, banking in
   * proportion to the turn rate (planes), a gentle lean (helicopters), a slow spin only (satellites), shrinking and fading over the last 40 %.
   * Returns true on the last frame.
   */
  private glideStep(visual: SceneObject | null, ht: Transform, icon: vec3, secs: number, dt: number, shrinkTo: number): boolean {
    this.t += dt / secs
    this.glideClock += dt
    const tt = clamp01(this.t)
    const k = tt * tt * tt * (tt * (tt * 6 - 15) + 10)
    const cam = this.camPos()
    const away = icon.sub(cam).length > 0.01 ? icon.sub(cam).normalize() : this.camForward()
    const end = icon.add(away.uniformScale(2)) // just past the icon
    const span = end.sub(this.fromPos)
    const len = Math.max(8, span.length)
    const c1 = this.fromPos.add(this.glideHeading0.uniformScale(len * 0.4))
    const c2 = end.sub(away.uniformScale(len * 0.3))
    const u = 1 - k
    const p = bezier3(this.fromPos, c1, c2, end, k)
    const tan = c1.sub(this.fromPos).uniformScale(3 * u * u)
      .add(c2.sub(c1).uniformScale(6 * u * k))
      .add(end.sub(c2).uniformScale(3 * k * k))
    ht.setWorldPosition(p)
    const g = clamp01((tt - 0.6) / 0.4)
    const gs = g * g * (3 - 2 * g)
    if (visual) {
      const sc = Math.max(0.01, 1 - (1 - shrinkTo) * gs)
      visual.getTransform().setLocalScale(new vec3(sc, sc, sc))
      const kind = this.info ? this.info.kind : "plane"
      if (kind === "satellite") {
        visual.getTransform().setWorldRotation(quat.angleAxis(2.5 * tt * tt, vec3.up()).multiply(this.fromRot)) // smooth glide, no banking
      } else if (tan.length > 0.01) {
        const d = tan.normalize()
        const turn = Math.atan2(this.lastDir.x * d.z - this.lastDir.z * d.x, this.lastDir.x * d.x + this.lastDir.z * d.z)
        const yawRate = dt > 0 ? turn / dt : 0
        this.lastDir = d
        const heli = kind === "helicopter"
        this.heading = quat.slerp(this.heading, faceDir(d), clamp01(dt * (heli ? 4 : 6)))
        const pitch = heli ? -HELI_TILT_RAD * Math.sin(Math.PI * tt) : 0.25 * Math.asin(Math.max(-1, Math.min(1, d.y))) // slight pitch toward the target
        let rot = this.heading.multiply(quat.angleAxis(pitch, vec3.right()))
        if (!heli) {
          const bankTarget = Math.max(-GLIDE_BANK_MAX, Math.min(GLIDE_BANK_MAX, -yawRate * GLIDE_BANK_GAIN))
          this.bank += (bankTarget - this.bank) * clamp01(dt * 5)
          rot = rot.multiply(quat.angleAxis(this.bank, new vec3(0, 0, 1)))
        }
        visual.getTransform().setWorldRotation(rot)
      }
    }
    this.setFade(1 - gs)
    return this.t >= 1
  }

  private completeCollect(): void {
    const info = this.info
    this.hangarPad.over = false
    this.clearModel()
    if (info) this._onCollected.invoke(info)
  }

  private completeSkyReturn(): void {
    const info = this.info
    this.skyPad.over = false
    const hooks = this.inspect
    this.clearModel()
    if (info) {
      this.sky.flashMarker(info.id)
      this._onSentToSky.invoke(info)
    }
    if (hooks) hooks.onSentToSky()
  }

  private hidePad(p: Pad | undefined): void {
    if (!p) return
    p.over = false
    p.dwell = 0
    p.alpha = 0
    p.glow = 0
    p.pulse = -1
    p.root.enabled = false
  }

  /** Close both icons: nothing hovered, nothing glowing. hard = also hide them at once (safety reset). */
  private closeIcons(hard: boolean): void {
    for (const p of [this.hangarPad, this.skyPad]) {
      if (!p) continue
      p.over = false
      p.dwell = 0
      if (hard) {
        p.alpha = 0
        p.glow = 0
        p.pulse = -1
        p.root.enabled = false
      }
    }
    this.iconIdleT = 0
  }

  /**
   * Mode change (Sky / Radar / Hangar): nothing stays in the hand and the icons close. A glide in progress is completed
   * (so a collected model is never lost); a shelf model goes back to its slot; a sky model stays in the sky.
   */
  resetForModeChange(): void {
    if (this.state === "collecting") this.completeCollect()
    else if (this.state === "returningToSky") this.completeSkyReturn()
    else if (this.state !== "none") {
      const hooks = this.inspect
      this.clearModel()
      if (hooks) hooks.onReturned()
    }
    this.closeIcons(true)
  }

  /** Test hook: force both icons open as if a bug left them stuck (the safety timeout must close them). */
  debugForceIconsOpen(): void {
    for (const p of [this.hangarPad, this.skyPad]) {
      if (!p) continue
      p.alpha = 1
      p.root.enabled = true
    }
    this.iconIdleT = 0
  }

  private captureRotation(): void {
    const visual = this.model ? this.model.root.getParent() : null
    this.fromRot = visual && !isNull(visual) ? visual.getTransform().getWorldRotation() : quat.quatIdentity()
  }

  /** Give every mesh under the model its own material so the collect fade does not touch the shared colour cache. */
  private prepareFade(): void {
    this.fadeMats = []
    const walk = (so: SceneObject) => {
      const rmv = so.getComponent("Component.RenderMeshVisual") as RenderMeshVisual | null
      if (rmv && rmv.mainMaterial) {
        const m = rmv.mainMaterial.clone()
        m.mainPass.blendMode = BlendMode.Normal
        rmv.mainMaterial = m
        this.fadeMats.push({mat: m, color: m.mainPass.baseColor})
      }
      for (let i = 0; i < so.getChildrenCount(); i++) walk(so.getChild(i))
    }
    if (this.model && !isNull(this.model.root)) walk(this.model.root)
  }

  private setFade(alpha: number): void {
    for (const f of this.fadeMats) f.mat.mainPass.baseColor = new vec4(f.color.x, f.color.y, f.color.z, f.color.w * alpha)
  }

  private startShelfReturn(): void {
    // Released in front of the shelf: a quick settle; anywhere else: a longer glide home.
    const hooks = this.inspect
    if (hooks) {
      const eye = this.camPos()
      const toModel = this.holder.getTransform().getWorldPosition().sub(eye).normalize()
      const toShelf = hooks.shelfPos().sub(eye).normalize()
      this.overShelf = Math.acos(Math.max(-1, Math.min(1, toModel.dot(toShelf)))) / DEG < 16
    }
    this.setState("returningToShelf")
    this.t = 0
    this.fromPos = this.holder.getTransform().getWorldPosition()
  }

  /** Release velocity from the last ~0.12 s of hand motion. */
  private releaseVelocity(): vec3 {
    const now = getTime()
    const first = this.samples.find((s) => now - s.time <= 0.12)
    const last = this.samples[this.samples.length - 1]
    if (first && last && last.time - first.time > 0.02) return last.pos.sub(first.pos).uniformScale(1 / (last.time - first.time))
    return vec3.zero()
  }
  private releaseSpeed(): number { return this.releaseVelocity().length }

  private startThrow(): void {
    // A drop with no motion goes straight ahead.
    let v = this.releaseVelocity()
    const speed = v.length
    if (speed < 40) v = this.camForward().uniformScale(THROW_MIN_SPEED_CM)
    else if (speed > this.throwMaxSpeedCm) v = v.uniformScale(this.throwMaxSpeedCm / speed)
    else if (speed < THROW_MIN_SPEED_CM) v = v.uniformScale(THROW_MIN_SPEED_CM / speed)
    this.throwVel = v
    this.throwDir = v.normalize()
    this.throwSpeed0 = v.length
    this.captureRotation()
    this.heading = this.fromRot // start from the pose it has in the hand, then turn smoothly into the flight
    this.lastDir = this.throwDir
    this.bank = 0
    this.throwPos = this.holder.getTransform().getWorldPosition()
    this.yawAtPull = this.camYaw()
    this.samples = []
    this.t = 0
    this.setState("thrown")
    if (this.info) this._onThrown.invoke(this.info)
  }

  private updatePad(p: Pad, pos: vec3, rot: quat, want: boolean, dt: number): void {
    p.alpha += ((want ? 1 : 0) - p.alpha) * clamp01(dt * 6)
    if (p.alpha < 0.02 && !want) {
      if (p.root.enabled) p.root.enabled = false
      p.over = false
      p.pulse = -1
      return
    }
    p.root.enabled = true
    if (p.pulse >= 0) {
      p.pulse += dt / 0.35
      if (p.pulse > 1) p.pulse = -1
    }
    p.root.getTransform().setWorldPosition(pos)
    p.root.getTransform().setWorldRotation(rot)
    p.glow += ((p.over ? 1 : 0) - p.glow) * clamp01(dt * 8)
    this.tintPad(p, p.alpha, p.glow)
    const g = p.glow
    p.accent.getTransform().setLocalScale(new vec3(g, g, g))
    const s = Math.max(0.01, p.alpha) * (1 + 0.1 * p.glow) * (p.pulse >= 0 ? 1 + 0.3 * Math.sin(Math.PI * p.pulse) : 1)
    p.root.getTransform().setLocalScale(new vec3(s, s, s))
  }

  // ---------- per frame ----------
  private update(): void {
    if (!this.holder) return
    const dt = getDeltaTime()
    const ht = this.holder.getTransform()
    const holding = (this.state === "flyingIn" && !this.viewOrigin) || this.state === "held"
    const yaw = this.yawAtPull

    // Pads: visible only while holding; brighter when the model is over them; fade out after release.
    // Pads are round glass buttons that face the eyes.
    const cam = this.camPos()
    const faceEyes = (at: vec3) => {
      const toCam = cam.sub(at)
      return toCam.length > 0.01 ? quat.lookAt(toCam.normalize(), vec3.up()) : quat.quatIdentity()
    }
    const hPos = this.padPos(yaw)
    const sPos = this.skyPadPos(yaw)
    this.updatePad(this.hangarPad, hPos, faceEyes(hPos), (holding && (!this.inspect || this.viewOrigin === "shelf")) || this.state === "collecting", dt)
    this.updatePad(this.skyPad, sPos, faceEyes(sPos), holding || this.state === "returningToSky", dt)

    this.watchIcons(dt)
    if (this.state === "none") return
    if (this.model) spinRotors(this.model, dt, this.state === "thrown" || this.state === "returning" ? 4 : 2.2)
    const visual = this.model ? this.model.root.getParent() : null

    try {
      this.runState(visual, ht, dt, yaw)
    } catch (e) {
      // An error mid-animation must never leave the state (and so the icons) stuck: finish the transition now.
      print("SkyHangarHeldController: " + e)
      this.recoverFromError()
    }
  }

  /** Safety nets: a glide that overruns, and icons that are open with nothing held or flying toward them. */
  private watchIcons(dt: number): void {
    const flying = this.state === "collecting" || this.state === "returningToSky"
    if (flying && this.glideClock > Math.max(COLLECT_SECONDS, this.skyReturnSeconds) + ICON_STUCK_SECONDS) this.recoverFromError()
    const holding = this.state === "held" || this.state === "flyingIn"
    const open = (this.hangarPad && this.hangarPad.root.enabled) || (this.skyPad && this.skyPad.root.enabled)
    if (holding || flying || !open) {
      this.iconIdleT = 0
      return
    }
    this.iconIdleT += dt
    if (this.iconIdleT >= ICON_STUCK_SECONDS) this.closeIcons(true)
  }

  private recoverFromError(): void {
    if (this.state === "collecting") this.completeCollect()
    else if (this.state === "returningToSky") this.completeSkyReturn()
    else if (this.state !== "none") this.clearModel()
    this.closeIcons(this.state === "none")
  }

  private runState(visual: SceneObject | null, ht: Transform, dt: number, yaw: number): void {
    switch (this.state) {
      case "flyingIn": {
        this.t += dt / this.flyInSeconds
        const k = easeOutCubic(this.t)
        const target = this.viewOrigin ? this.viewPos(yaw) : this.interactor ? this.rayHoldPoint(this.interactor) ?? this.handPos(yaw) : this.handPos(yaw)
        ht.setWorldPosition(vec3.lerp(this.fromPos, target, k))
        const sc = this.fromScale + (1 - this.fromScale) * k
        if (visual) visual.getTransform().setLocalScale(new vec3(sc, sc, sc))
        this.faceUser(visual, 0)
        if (this.t >= 1) {
          if (visual) visual.getTransform().setLocalScale(vec3.one())
          if (this.viewOrigin) this.setState("viewing")
          else if (this.interactor && this.interactor.isTriggering) this.setState("held")
          else if (this.interactor === null && this.lastWasScripted) this.setState("held")
          else if (this.inspect) this.startShelfReturn()
          else this.setState("resting")
        }
        break
      }
      case "held": {
        if (this.interactor) {
          if (!this.interactor.isTriggering) {
            this.release(null)
            break
          }
          const p = this.rayHoldPoint(this.interactor)
          if (p) ht.setWorldPosition(vec3.lerp(ht.getWorldPosition(), p, clamp01(dt * 18)))
          if (this.interactor.inputType & (InteractorInputType.LeftHand | InteractorInputType.RightHand)) {
            const o = this.interactor.orientation
            if (o) this.spinTarget = yawOf(o.multiplyVec3(new vec3(0, 0, -1))) - yaw
          }
          const pos = ht.getWorldPosition()
          this.samples.push({pos, time: getTime()})
          if (this.samples.length > 12) this.samples.shift()
          const capture = this.padDiameterCm * 0.5 * PAD_HIT_SCALE
          const dH = this.padMiss(pos, this.padPos(yaw))
          const dS = this.padMiss(pos, this.skyPadPos(yaw))
          const nearH = (!this.inspect || this.viewOrigin === "shelf") && dH < capture && dH <= dS
          const nearS = dS < capture && dS < dH
          this.hangarPad.dwell = nearH ? this.hangarPad.dwell + dt : 0
          this.skyPad.dwell = nearS ? this.skyPad.dwell + dt : 0
          this.hangarPad.over = this.hangarPad.dwell >= PAD_DWELL_SECONDS
          this.skyPad.over = this.skyPad.dwell >= PAD_DWELL_SECONDS
        } else if (!this.lastWasScripted) {
          this.release(null) // held without a hand to hold it: never stay stuck in "held"
          break
        }
        this.faceUser(visual, dt)
        break
      }
      case "viewing": {
        // Inspect mode: hangs 40 cm ahead with a faint bob, turning slowly.
        const bob = Math.sin(getTime() * 2) * 0.4
        ht.setWorldPosition(vec3.lerp(ht.getWorldPosition(), this.viewPos(yaw).add(new vec3(0, bob, 0)), clamp01(dt * 6)))
        this.spinTarget += VIEW_TURN_RAD_PER_S * dt
        this.faceUser(visual, dt)
        this.updateViewInput()
        break
      }
      case "collecting": {
        // ~1.1 s glide into the Hangar icon (see glideStep); the icon pulses as it arrives.
        const done = this.glideStep(visual, ht, this.padPos(yaw), COLLECT_SECONDS, dt, 0)
        if (this.t >= 0.8 && !this.collectPulsed) {
          this.collectPulsed = true
          this.hangarPad.pulse = 0
        }
        if (done) this.completeCollect()
        break
      }
      case "returningToSky": {
        // Original send-to-sky motion (not the Hangar glide): rise first, then glide home along the sky.
        this.t += dt / this.skyReturnSeconds
        this.glideClock += dt
        const k = easeInOut(this.t)
        const info = this.info
        const home = (info ? this.sky.getMarkerWorldPos(info.id) : null) ?? this.fromPos.add(new vec3(0, 300, -300))
        const lift = this.fromPos.add(new vec3(0, 60, 0))
        const p = bezier3(this.fromPos, lift, vec3.lerp(lift, home, 0.6), home, k)
        const ahead = bezier3(this.fromPos, lift, vec3.lerp(lift, home, 0.6), home, Math.min(1, k + 0.02))
        ht.setWorldPosition(p)
        const sc = 1 - 0.8 * k
        if (visual) {
          visual.getTransform().setLocalScale(new vec3(sc, sc, sc))
          const vel = ahead.sub(p)
          if (vel.length > 0.01) visual.getTransform().setWorldRotation(quat.slerp(this.fromRot, faceDir(vel), easeOutCubic(clamp01(k / 0.25))))
        }
        if (this.t >= 1) this.completeSkyReturn()
        break
      }
      case "returningToShelf": {
        // Glide back to the slot (a short settle when released in front of the shelf) and shrink to shelf size.
        const hooks = this.inspect
        const slot = hooks ? hooks.slotPos() : null
        this.t += dt / (this.overShelf ? 0.45 : 0.9)
        const k = easeInOut(this.t)
        const home = slot ?? this.fromPos
        const lift = this.fromPos.add(new vec3(0, this.overShelf ? 2 : 18, 0))
        ht.setWorldPosition(bezier3(this.fromPos, lift, vec3.lerp(lift, home, 0.6), home, k))
        const end = hooks ? hooks.shelfSpanCm / this.modelSpanCm : 0.4
        const sc = 1 + (end - 1) * k
        if (visual) visual.getTransform().setLocalScale(new vec3(sc, sc, sc))
        this.faceUser(visual, dt)
        if (this.t >= 1) {
          this.clearModel()
          if (hooks) hooks.onReturned()
        }
        break
      }
      case "thrown":
      case "returning": {
        // Paper-plane glide: keep the release velocity (slowly bleeding speed), then curve back to the hand.
        const hooks = this.inspect
        const back = this.viewOrigin === "sky" ? this.viewPos(yaw) : this.handPos(yaw) // a sky model viewed in 3D returns to the inspect spot
        const hand = hooks ? hooks.slotPos() ?? back : back // from the hangar it comes home to its slot
        const before = ht.getWorldPosition()
        if (this.state === "thrown") {
          // Straight glide that eases out: speed falls smoothly from the release speed to GLIDE_END_SPEED of it.
          this.t += dt / this.throwSeconds
          const left = 1 - clamp01(this.t)
          const speed = this.throwSpeed0 * (GLIDE_END_SPEED + (1 - GLIDE_END_SPEED) * left * left)
          this.throwPos = this.throwPos.add(this.throwDir.uniformScale(speed * dt))
          ht.setWorldPosition(this.throwPos)
          if (this.t >= 1) {
            this.setState("returning")
            this.t = 0
            this.fromPos = this.throwPos
            // Wide U-turn: leave along the glide heading (matching speed), bulge sideways toward the hand's side.
            let side = vec3.up().cross(this.throwDir)
            if (side.length < 0.2) side = this.cameraObject.getTransform().getWorldRotation().multiplyVec3(vec3.right())
            side = side.normalize()
            this.turnSide = side.uniformScale(side.dot(hand.sub(this.fromPos)) >= 0 ? 1 : -1)
            const c1Len = Math.max(40, (this.throwSpeed0 * GLIDE_END_SPEED * this.returnSeconds) / 6)
            this.turnC1 = this.fromPos.add(this.throwDir.uniformScale(c1Len))
          }
        } else {
          this.t += dt / this.returnSeconds
          const u = clamp01(this.t)
          const k = 1 - (1 - u) * (1 - u) // starts at the glide speed, settles into the hand
          const c2 = hand.add(this.turnSide.uniformScale(TURN_WIDTH_CM))
          ht.setWorldPosition(bezier3(this.fromPos, this.turnC1, c2, hand, k))
          if (hooks && visual) {
            const sc = 1 + (hooks.shelfSpanCm / this.modelSpanCm - 1) * k
            visual.getTransform().setLocalScale(new vec3(sc, sc, sc))
          }
          if (this.t >= 1) {
            ht.setWorldPosition(hand)
            if (hooks) {
              const info = this.info
              this.clearModel()
              if (info) this._onReturned.invoke(info)
              hooks.onReturned()
              break
            }
            this.rotBlend = 1.2 // ease into the resting pose instead of snapping
            this.setState(this.viewOrigin ? "viewing" : "resting")
            if (this.info) this._onReturned.invoke(this.info)
          }
        }
        if (visual) this.flyRotation(visual, ht.getWorldPosition().sub(before), dt)
        break
      }
      case "resting": {
        const hand = this.handPos(yaw)
        const bob = Math.sin(getTime() * 2) * 0.6
        ht.setWorldPosition(vec3.lerp(ht.getWorldPosition(), hand.add(new vec3(0, bob, 0)), clamp01(dt * 6)))
        this.faceUser(visual, dt)
        this.updateGrab()
        break
      }
    }
  }

  private updateGrab(): void {
    if (!this.grabPending || !this.interactor) return
    const it = this.interactor
    const elapsed = getTime() - this.grabT0
    const moved = this.rayMoveCm(it, this.grabDir0)
    if (!it.isTriggering) {
      this.grabPending = false
      this.interactor = null
      if (isTap(elapsed, moved)) this.spinTarget += Math.PI / 2 // quick tap turns the model
      return
    }
    if (dragStarted(elapsed, moved)) {
      this.grabPending = false
      this.lastWasScripted = false
      this.yawAtPull = this.camYaw()
      this.setState("held")
    }
  }

  /** Nose along the direction of travel (smoothed), banking gently into the turn like a paper plane. */
  private flyRotation(visual: SceneObject, step: vec3, dt: number): void {
    if (dt <= 0 || step.length < 0.01) {
      visual.getTransform().setWorldRotation(this.heading.multiply(quat.angleAxis(this.bank, new vec3(0, 0, 1))))
      return
    }
    const d = step.normalize()
    const yawRate = Math.atan2(this.lastDir.x * d.z - this.lastDir.z * d.x, this.lastDir.x * d.x + this.lastDir.z * d.z) / dt
    this.lastDir = d
    const bankTarget = Math.max(-0.6, Math.min(0.6, -yawRate * 0.35))
    this.bank += (bankTarget - this.bank) * clamp01(dt * 4)
    this.heading = quat.slerp(this.heading, faceDir(d), clamp01(dt * 8))
    visual.getTransform().setWorldRotation(this.heading.multiply(quat.angleAxis(this.bank, new vec3(0, 0, 1))))
  }

  /** Model faces across the user's view (3/4 view), plus any one-hand turn. */
  private faceUser(visual: SceneObject | null, dt: number): void {
    if (!visual) return
    this.spinYaw += (this.spinTarget - this.spinYaw) * (dt > 0 ? clamp01(dt * 8) : 1)
    const base = yawRotation(this.yawAtPull + 2.4 + this.spinYaw)
    let target: quat
    if (this.info && this.info.kind === "satellite") {
      // pitch the whole model so its panel face (+Y) leans toward the user; the slow spin stays about the model's own axis (inside the model)
      if (dt > 0) this.satTilt += (1 - this.satTilt) * clamp01(dt * 3)
      const a = SAT_TILT_RAD * this.satTilt
      const toUser = flatForward(this.yawAtPull).uniformScale(-1)
      target = quat.rotationFromTo(vec3.up(), vec3.up().uniformScale(Math.cos(a)).add(toUser.uniformScale(Math.sin(a)))).multiply(base)
    } else target = base.multiply(quat.angleAxis(0.25, vec3.right()))
    const vt = visual.getTransform()
    if (this.rotBlend > 0 && dt > 0) {
      this.rotBlend -= dt
      vt.setWorldRotation(quat.slerp(vt.getWorldRotation(), target, clamp01(dt * 6)))
    } else vt.setWorldRotation(target)
  }
}
