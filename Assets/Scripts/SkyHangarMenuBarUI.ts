// SkyHangarMenuBarUI.ts
// Owns: the slim menu bar (UIKit BackPlate + FlexLayout row of three toggle Buttons: Routes, Radar, Hangar),
// always in the lower part of the view. Lazy-follow: it keeps a spot below the view centre and drifts
// after you when you turn or look up/down, settling in about a second (never snaps, never left behind).
// Compact and dim while you look at the sky; brightens when you look down near it or aim at a button.
// Public API: setActiveMode (radar / hangar lit, sky = none), setAllRoutesOn / isAllRoutesOn, getActiveMode, isBright, isInView, getWorldPos,
// getViewAngles. Emits: onAllRoutes (Routes tapped), onRadar, onHangar.
// Part B restyles the buttons (round glass); the API stays the same.
// Passive view — the main script decides what each mode does.

import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {ElementContent} from "SpectaclesUIKit.lspkg/Scripts/Components/Content/ElementContent"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {applyFontToContent, addFlexChild, enlargeHitArea, addTextRow, glassSurface, GLASS, makeFlex, obj, roleSize, rowHeight, PALETTE, SPACE, TEXT, FlexDirection, FlexJustify, FlexAlign} from "./SkyHangarSharedUI"

const ICON_RADAR = requireAsset("../Icons/radar.png") as Texture
const ICON_HANGAR = requireAsset("../Icons/warehouse.png") as Texture
const ICON_ROUTES = requireAsset("../Icons/routes_128x128 2.png") as Texture

const GLYPH_MIN_OPACITY = 0.9
const MIN_DIST_CM = 70
const MAX_DIST_CM = 120
const HEAD_TAU_S = 0.15 // head-position low-pass time constant
const MAX_AZ_DEG = 35 // how far the bar may lag sideways from the gaze centre
const BAND_ABOVE_DEG = 4 // never higher on screen than idle minus this
const BAND_BELOW_DEG = 12 // never lower than idle plus this
const DIST_DEADZONE_CM = 10 // walking/leaning changes smaller than this don't move the bar

@component
export class SkyHangarMenuBarUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarMenuBarUI – Routes / Radar / Hangar bar</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("The main camera SceneObject (the bar follows it lazily)")
  cameraObject!: SceneObject
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Distance of the bar from the eyes, cm (~70 cm)")
  @widget(new SliderWidget(40, 120, 1))
  distanceCm: number = 68
  @input
  @hint("How far below the view centre the bar sits, degrees (lower part of the view)")
  @widget(new SliderWidget(5, 30, 0.5))
  belowViewDeg: number = 15
  @input
  @hint("Half-size of the display region used for the 'in view' check, degrees")
  @widget(new SliderWidget(5, 30, 0.5))
  viewHalfAngleDeg: number = 14
  @input
  @hint("Width of each button, cm")
  @widget(new SliderWidget(4, 12, 0.5))
  buttonWidthCm: number = 6.5
  @input
  @hint("Height of each button, cm")
  @widget(new SliderWidget(3, 10, 0.5))
  buttonHeightCm: number = 5.5
  @input
  @hint("Seconds the bar takes to settle in front of you after you turn")
  @widget(new SliderWidget(0.3, 3, 0.1))
  settleSeconds: number = 1.0
  @input
  @hint("How far (degrees) your view can move before the bar starts drifting after you")
  @widget(new SliderWidget(0, 30, 0.5))
  driftDeadzoneDeg: number = 6
  @input
  @hint("Look this many degrees below the horizon to brighten the bar")
  @widget(new SliderWidget(0, 60, 1))
  brightenBelowDeg: number = 12
  @input
  @hint("Scale while dim (looking at the sky)")
  @widget(new SliderWidget(0.3, 1, 0.05))
  dimScale: number = 0.7
  @input
  @hint("Opacity while dim (looking at the sky)")
  @widget(new SliderWidget(0.1, 1, 0.05))
  dimOpacity: number = 0.45
  @ui.group_end

  private buttons: Button[] = []
  private accents: RoundedRectangle[] = []
  private labelTexts: Text[] = []
  private contents: ElementContent[] = []
  private mode = "sky"
  private placed = false
  private drifting = false
  private headF = vec3.zero() // low-passed head position used by the follow
  private hovered = 0
  private brightness = 0
  private bright = false
  private modeDirty = true
  private frames = 0
  private menuHeightCm = 8
  private lastOpacity = -1
  private _onRadar = new Event<void>()
  private _onHangar = new Event<void>()
  private _onAllRoutes = new Event<void>()
  private allRoutesOn = false
  get onRadar(): PublicApi<void> { return this._onRadar.publicApi() }
  get onHangar(): PublicApi<void> { return this._onHangar.publicApi() }
  get onAllRoutes(): PublicApi<void> { return this._onAllRoutes.publicApi() }

  onAwake(): void {
    this.build()
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  /** Follow distance, clamped to 70-120 cm whatever the scene value says. */
  private get dist(): number { return Math.max(MIN_DIST_CM, Math.min(MAX_DIST_CM, this.distanceCm)) }
  /** Head-space offset of the idle spot: the fixed angle (belowViewDeg) below the gaze centre, at the follow distance. */
  private idealLocal(): vec3 {
    const b = (this.belowViewDeg * Math.PI) / 180
    return new vec3(0, -Math.sin(b) * this.dist, -Math.cos(b) * this.dist)
  }
  /**
   * Hard limits in head space: angle below the gaze centre within [belowViewDeg - 4, belowViewDeg + 12] (never higher on screen
   * than the idle spot minus 4 deg), horizontal offset from the gaze centre within +-35 deg, distance from the head 70-120 cm.
   * Returns the same vec3 object when nothing needed correcting.
   */
  private limitToBand(pos: vec3, camPos: vec3, camRot: quat): vec3 {
    const l = camRot.invert().multiplyVec3(pos.sub(camPos))
    const r = Math.max(0.001, l.length)
    const rad = Math.PI / 180
    const az = Math.atan2(l.x, -l.z) / rad
    const below = -Math.atan2(l.y, Math.hypot(l.x, l.z)) / rad
    const rr = Math.max(MIN_DIST_CM, Math.min(MAX_DIST_CM, r))
    const aa = Math.max(-MAX_AZ_DEG, Math.min(MAX_AZ_DEG, az))
    const bb = Math.max(this.belowViewDeg - BAND_ABOVE_DEG, Math.min(this.belowViewDeg + BAND_BELOW_DEG, below))
    if (rr === r && aa === az && bb === below) return pos
    const el = -bb * rad
    const ar = aa * rad
    const out = new vec3(rr * Math.cos(el) * Math.sin(ar), rr * Math.sin(el), -rr * Math.cos(el) * Math.cos(ar))
    return camPos.add(camRot.multiplyVec3(out))
  }
  getActiveMode(): string { return this.mode }
  getWorldPos(): vec3 { return this.sceneObject.getTransform().getWorldPosition() }
  isDrifting(): boolean { return this.drifting }
  /** Bar centre in view angles (deg): x right, y up, relative to the view centre. */
  getViewAngles(): vec2 {
    if (!this.cameraObject) return vec2.zero()
    const ct = this.cameraObject.getTransform()
    const l = ct.getWorldRotation().invert().multiplyVec3(this.getWorldPos().sub(ct.getWorldPosition()))
    const fwd = Math.max(0.001, -l.z)
    return new vec2((Math.atan2(l.x, fwd) * 180) / Math.PI, (Math.atan2(l.y, fwd) * 180) / Math.PI)
  }
  /** True when the bar centre is in front of the user inside the display region. */
  isInView(): boolean {
    if (!this.cameraObject) return false
    const ct = this.cameraObject.getTransform()
    const l = ct.getWorldRotation().invert().multiplyVec3(this.getWorldPos().sub(ct.getWorldPosition()))
    if (l.z > -1) return false
    const a = this.getViewAngles()
    return Math.abs(a.x) <= this.viewHalfAngleDeg && Math.abs(a.y) <= this.viewHalfAngleDeg + 2
  }
  /** Elevation (deg, relative to the view centre) of the bar's top edge, at full size: cards keep clear of it. */
  getTopViewAngleDeg(): number {
    return this.getViewAngles().y + (Math.atan2(this.menuHeightCm / 2, this.dist) * 180) / Math.PI
  }
  /** What the hint pill attaches to: the bar's root (the object the lazy follow moves), the local Y of its top edge, and its authored distance (cm). */
  getHintAnchor(): {root: SceneObject; topCm: number; distCm: number} { return {root: this.sceneObject, topCm: this.menuHeightCm / 2, distCm: this.dist} }
  isAllRoutesOn(): boolean { return this.allRoutesOn }
  setAllRoutesOn(on: boolean): void {
    this.allRoutesOn = on
    this.applyButtonState(0, on)
  }
  isBright(): boolean { return this.bright }
  getButtonObject(mode: string): SceneObject | null {
    const i = ["routes", "radar", "hangar"].indexOf(mode)
    return i >= 0 && this.buttons[i] ? this.buttons[i].sceneObject : null
  }

  /** Radar / Hangar are panels: the open one is lit; "sky" (home) lights neither. Routes is an overlay with its own state. */
  setActiveMode(mode: string): void {
    this.mode = mode
    this.applyButtonState(1, mode === "radar")
    this.applyButtonState(2, mode === "hangar")
    this.applyButtonState(0, this.allRoutesOn)
  }

  /** Lit = solid white disc + dark glyph (and the toggle's isOn); unlit = quiet frosted disc + white glyph. */
  private applyButtonState(i: number, on: boolean): void {
    if (!this.buttons[i]) return
    try {
      if (this.buttons[i].isOn !== on) this.buttons[i].isOn = on
    } catch (e) {
      this.modeDirty = true
    }
    if (this.accents[i]) this.accents[i].getSceneObject().getTransform().setLocalScale(on ? vec3.one() : vec3.zero())
    if (this.labelTexts[i]) this.labelTexts[i].textFill.color = TEXT.primary // the label sits on the frosted bar below the disc, so it stays white
    if (this.contents[i]) this.tintIcon(this.contents[i], on)
  }

  /** White icon normally; dark slate on the solid white (active) disc. */
  private tintIcon(ec: ElementContent, on: boolean): void {
    const ecAny = ec as any
    ecAny._useThemeColors = false
    const c = on ? GLASS.slate : new vec4(1, 1, 1, 0.85)
    const h = on ? c : new vec4(1, 1, 1, 1)
    ecAny._defaultIconTint = c
    ecAny._hoveredIconTint = h
    ecAny._triggeredIconTint = h
    ecAny._inactiveIconTint = c
    ec.markColorsDirty()
  }
  /** Cluster of three round toggle buttons: lit = solid white disc, the rest quiet frosted discs. */
  private build(): void {
    const D = this.dist
    const k = D / 110
    const B = this.buttonWidthCm // round button diameter
    this.sceneObject.createComponent("Component.Canvas")
    const panel = obj(this.sceneObject, "MenuBarPanel")
    // HeadlineXL (semi-bold): cap height about 1.3 cm at 1.2 m (about 0.6 degrees), above the Body minimum
    const labelH = rowHeight("HeadlineXL", D)
    const colH = B + labelH + SPACE.xs * k
    const pillW = 3 * B + 2 * SPACE.l * k + 2 * SPACE.l * k
    const pillH = colH + 2 * SPACE.s * k
    this.menuHeightCm = pillH
    glassSurface(panel, "MenuBarGlass", new vec2(pillW, pillH), {radiusCm: Math.min(pillW, pillH) / 2})
    const content = obj(panel, "Content", new vec3(0, 0, 0.6))
    const row = makeFlex(content, "Row", FlexDirection.Row, pillW, pillH, {gap: SPACE.l * k, justify: FlexJustify.Center, align: FlexAlign.Center})
    const icons = [ICON_ROUTES, ICON_RADAR, ICON_HANGAR]
    const names = ["Routes", "Radar", "Hangar"]
    const events = [this._onAllRoutes, this._onRadar, this._onHangar]
    for (let i = 0; i < 3; i++) {
      const col = makeFlex(row.so, "MenuItem_" + names[i], FlexDirection.Column, B, colH, {gap: SPACE.xs * k, justify: FlexJustify.Center, align: FlexAlign.Center})
      addFlexChild(col.so, row.flex, B, colH)
      const holder = obj(col.so, "MenuButtonHolder_" + names[i], new vec3(0, 0, 0.02))
      addFlexChild(holder, col.flex, B, B)
      // Quiet frosted disc under every button (inactive look): white ~14% fill, thin rim
      const disc = glassSurface(holder, "MenuDisc_" + names[i], new vec2(B, B), {radiusCm: B, fill: 0.67, rim: 0.7})
      // Solid white disc for the active button
      const acc = glassSurface(holder, "MenuActive_" + names[i], new vec2(B * 1.04, B * 1.04), {radiusCm: B, solid: true, rim: 0})
      acc.so.getTransform().setLocalPosition(new vec3(0, 0, 0.04))
      acc.so.getTransform().setLocalScale(vec3.zero())
      this.accents.push(acc.rect)
      const so = obj(holder, "MenuButton_" + names[i], new vec3(0, 0, 0.1))
      const btn = so.createComponent(Button.getTypeName()) as Button
      btn.setVariant({theme: "SnapOS2", shape: "Round", style: "Ghost"}) // transparent fill: the glass discs above/below carry the look
      btn.size = new vec3(B, B, 1)
      enlargeHitArea(btn)
      btn.setIsToggleable(true)
      const ec = so.createComponent(ElementContent.getTypeName()) as ElementContent
      ec.leadingIcon = icons[i]
      ec.iconLayout = "left"
      ec.leadingIconSize = B * 0.5
      // Bright white icons at ~85% (UIKit keeps these tints private; flip theme colours off and write them)
      const ecAny = ec as any
      ecAny._useThemeColors = false
      const white = new vec4(1, 1, 1, 0.85)
      ecAny._defaultIconTint = white
      ecAny._hoveredIconTint = new vec4(1, 1, 1, 1)
      ecAny._triggeredIconTint = new vec4(1, 1, 1, 1)
      ecAny._inactiveIconTint = white
      ec.markColorsDirty()
      const ev = events[i]
      btn.onTriggerUp.add(() => ev.invoke())
      btn.onHoverEnter.add(() => { this.hovered++; disc.setHover(true) })
      btn.onHoverExit.add(() => { this.hovered = Math.max(0, this.hovered - 1); disc.setHover(false) })
      this.buttons.push(btn)
      this.contents.push(ec)
      this.labelTexts.push(addTextRow(col.so, col.flex, "MenuLabel_" + names[i], names[i], "HeadlineXL", B * 1.4, labelH, TEXT.primary, D))
    }
  }

  private update(): void {
    if (!this.cameraObject) return
    this.frames++
    if (this.modeDirty && this.frames > 3) {
      this.modeDirty = false
      this.setActiveMode(this.mode)
    }
    const dt = getDeltaTime()
    const ct = this.cameraObject.getTransform()
    const camPos = ct.getWorldPosition()
    const camRot = ct.getWorldRotation()
    const fwd = camRot.multiplyVec3(new vec3(0, 0, -1))
    const tr = this.sceneObject.getTransform()
    const D = this.dist
    // First placement waits until the camera has a real pose (not the default origin/identity), or 30 frames at most,
    // so the bar lands in the same spot on first open and on reload. Hidden (scale 0) until then.
    if (!this.placed) {
      const camDefault = camPos.length < 0.01 && Math.abs(camRot.w) > 0.9999
      this.headF = camPos
      if (this.frames < 2 || (camDefault && this.frames < 30)) {
        tr.setLocalScale(vec3.zero())
        return
      }
      tr.setWorldPosition(camPos.add(camRot.multiplyVec3(this.idealLocal())))
      this.placed = true
    }
    // Low-pass the head position used for the follow (walking head bob is what makes a head-locked bar shake).
    this.headF = this.headF.add(camPos.sub(this.headF).uniformScale(1 - Math.exp(-dt / HEAD_TAU_S)))
    // Target in head space: always the same angle below the gaze centre, at distance D.
    const idealDir = camRot.multiplyVec3(this.idealLocal()).uniformScale(1 / D)
    // Lazy follow: dead-zone, then exponential smoothing as a ROTATION around the head (slerp of the direction) with the
    // distance eased to D. Never a straight-line lerp, so the bar can't pass through the face.
    const cur = tr.getWorldPosition()
    const curVec = cur.sub(this.headF)
    const curDist = Math.max(0.001, curVec.length)
    const curDir = curVec.uniformScale(1 / curDist)
    const off = (Math.acos(Math.max(-1, Math.min(1, curDir.dot(idealDir)))) * 180) / Math.PI
    if (off > this.driftDeadzoneDeg || Math.abs(curDist - D) > DIST_DEADZONE_CM) this.drifting = true
    let pos = cur
    if (this.drifting) {
      const k = 1 - Math.exp((-dt * 4.6) / this.settleSeconds) // ~99% settled after settleSeconds
      let axis = curDir.cross(idealDir)
      if (axis.length < 1e-4) axis = vec3.up() // opposite or aligned: turn about the vertical
      const newDir = quat.angleAxis(((off * k) * Math.PI) / 180, axis.normalize()).multiplyVec3(curDir)
      pos = this.headF.add(newDir.uniformScale(curDist + (D - curDist) * k))
      if (off < 0.5 && Math.abs(curDist - D) < 1) this.drifting = false
    }
    // Hard limits every frame, after smoothing (see limitToBand): bottom band of the view, distance 70-120 cm from the head.
    const lim = this.limitToBand(pos, camPos, camRot)
    if (lim !== cur) tr.setWorldPosition(lim)
    const toCam = camPos.sub(tr.getWorldPosition())
    if (toCam.length > 0.01) tr.setWorldRotation(quat.lookAt(toCam.normalize(), vec3.up()))

    // Dim + compact while looking at the sky; bright when looking down near it or aiming at a button.
    const pitchDeg = (Math.asin(Math.max(-1, Math.min(1, fwd.y))) * 180) / Math.PI
    const want = pitchDeg < -this.brightenBelowDeg || this.hovered > 0 ? 1 : 0
    this.bright = want === 1
    this.brightness += (want - this.brightness) * Math.min(1, dt * 6)
    const s = this.dimScale + (1 - this.dimScale) * this.brightness
    tr.setLocalScale(new vec3(s, s, s))
    const op = this.dimOpacity + (1 - this.dimOpacity) * this.brightness
    if (this.frames > 3 && Math.abs(op - this.lastOpacity) > 0.01) {
      this.lastOpacity = op
      for (const btn of this.buttons) btn.opacity = op
      for (const c of this.contents) c.opacity = Math.max(op, GLYPH_MIN_OPACITY) // glyphs stay legible while the bar is dim
    }
  }
}
