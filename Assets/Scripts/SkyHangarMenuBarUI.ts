// SkyHangarMenuBarUI.ts
// Owns: the slim menu bar (UIKit BackPlate + FlexLayout row of three Buttons: Sky, Radar, Hangar),
// always in the lower part of the view. Lazy-follow: it keeps a spot below the view centre and drifts
// after you when you turn or look up/down, settling in about a second (never snaps, never left behind).
// Compact and dim while you look at the sky; brightens when you look down near it or aim at a button.
// Public API: setActiveMode, getActiveMode, isBright, isInView, getWorldPos, getViewAngles. Emits: onSky, onRadar, onHangar.
// Part B restyles the buttons (round glass); the API stays the same.
// Passive view — the main script decides what each mode does.

import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {ElementContent} from "SpectaclesUIKit.lspkg/Scripts/Components/Content/ElementContent"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {applyFontToContent, addFlexChild, enlargeHitArea, addTextRow, glassPanel, makeFlex, obj, GLASS_READABLE, roleSize, rowHeight, PALETTE, SPACE, TEXT, FlexDirection, FlexJustify, FlexAlign} from "./SkyHangarSharedUI"

const ICON_SKY = requireAsset("../Icons/cloud.png") as Texture
const ICON_RADAR = requireAsset("../Icons/radar.png") as Texture
const ICON_HANGAR = requireAsset("../Icons/warehouse.png") as Texture
const ICON_ROUTES = requireAsset("../Icons/routes_128x128 2.png") as Texture

const HINT_STEPS = ["Look up to find aircraft", "Aim and pinch to pin it", "Pinch and drag to the Hangar"]
const HINT_STEP_SECONDS = 2.5
const DOUBLE_TAP_SECONDS = 0.8
const TIP_SECONDS = 1.5 // "All routes" label
const TIP_FADE_IN_S = 0.2
const TIP_FADE_OUT_S = 0.3

@component
export class SkyHangarMenuBarUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarMenuBarUI – Sky / Radar / Hangar bar</span>')
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
  @input
  @hint("Button labels: Sky, Radar, Hangar")
  labels: string[] = ["Sky", "Radar", "Hangar"]
  @ui.group_end

  private buttons: Button[] = []
  private accents: RoundedRectangle[] = []
  private labelTexts: Text[] = []
  private contents: ElementContent[] = []
  private mode = "sky"
  private placed = false
  private drifting = false
  private hovered = 0
  private brightness = 0
  private bright = false
  private modeDirty = true
  private frames = 0
  private menuHeightCm = 8
  private lastOpacity = -1
  private _onSky = new Event<void>()
  private _onRadar = new Event<void>()
  private _onHangar = new Event<void>()
  private _onAllRoutes = new Event<boolean>()
  private toggleRoot: SceneObject | null = null
  private toggleBtn: Button | null = null
  private toggleContent: ElementContent | null = null
  private toggleActive: SceneObject | null = null
  private allRoutesOn = false
  private tipRoot: SceneObject | null = null
  private tipGlass: RoundedRectangle | null = null
  private tipText: Text | null = null
  private tipT = 0
  private hintRoot: SceneObject | null = null
  private hintText: Text | null = null
  private hintStep = -1 // -1 = not showing
  private hintT = 0
  private hintPlays = 0
  private hintStarted = false
  private lastSkyTap = -10
  private toggleExtraCm = 0 // height the toggle adds above the bar (incl. gap), for cards to clear
  get onSky(): PublicApi<void> { return this._onSky.publicApi() }
  get onRadar(): PublicApi<void> { return this._onRadar.publicApi() }
  get onHangar(): PublicApi<void> { return this._onHangar.publicApi() }
  get onAllRoutes(): PublicApi<boolean> { return this._onAllRoutes.publicApi() }

  onAwake(): void {
    this.build()
    this.createEvent("UpdateEvent").bind(() => this.update())
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
    const extra = this.mode === "sky" ? this.toggleExtraCm : 0
    return this.getViewAngles().y + (Math.atan2(this.menuHeightCm / 2 + extra, this.distanceCm) * 180) / Math.PI
  }
  isAllRoutesOn(): boolean { return this.allRoutesOn }
  setAllRoutesOn(on: boolean): void {
    this.allRoutesOn = on
    if (this.toggleActive) this.toggleActive.getTransform().setLocalScale(on ? vec3.one() : vec3.zero())
    this.tintToggleIcon(on)
  }
  // ---- first-use hint ----
  isHintVisible(): boolean { return this.hintStep >= 0 }
  getHintText(): string { return this.hintStep >= 0 ? HINT_STEPS[this.hintStep] : "" }
  /** How many times the hint has started (once at start, plus once per quick double-tap on Sky). */
  getHintPlays(): number { return this.hintPlays }
  getHintWorldPos(): vec3 | null { return this.hintRoot ? this.hintRoot.getTransform().getWorldPosition() : null }
  showHint(): void {
    if (!this.hintRoot || this.mode !== "sky") return
    this.hintStep = 0
    this.hintT = 0
    this.hintPlays++
    this.applyHint()
  }
  dismissHint(): void {
    if (this.hintStep < 0) return
    this.hintStep = -1
    this.applyHint()
  }
  private applyHint(): void {
    if (!this.hintRoot || !this.hintText) return
    if (this.hintStep >= 0) this.hintText.text = HINT_STEPS[this.hintStep]
    this.hintRoot.getTransform().setLocalScale(this.hintStep >= 0 ? vec3.one() : vec3.zero())
  }

  isBright(): boolean { return this.bright }
  getButtonObject(mode: string): SceneObject | null {
    const i = ["sky", "radar", "hangar"].indexOf(mode)
    return i >= 0 && this.buttons[i] ? this.buttons[i].sceneObject : null
  }

  setActiveMode(mode: string): void {
    this.mode = mode
    const modes = ["sky", "radar", "hangar"]
    for (let i = 0; i < this.buttons.length; i++) {
      const on = modes[i] === mode
      try {
        if (this.buttons[i].isOn !== on) this.buttons[i].isOn = on
      } catch (e) {
        this.modeDirty = true
      }
      if (this.accents[i]) this.accents[i].getSceneObject().getTransform().setLocalScale(on ? vec3.one() : vec3.zero())
      if (this.labelTexts[i]) this.labelTexts[i].textFill.color = TEXT.primary
    }
    if (this.toggleRoot) this.toggleRoot.getTransform().setLocalScale(mode === "sky" ? vec3.one() : vec3.zero())
    if (mode !== "sky") this.dismissHint()
    if (mode !== "sky" && this.tipRoot) { this.tipT = 0; this.tipRoot.getTransform().setLocalScale(vec3.zero()) }
  }

  /** Label alpha: quick fade in, hold, fade out over the 1.5 s. */
  private applyTip(): void {
    if (!this.tipGlass || !this.tipText) return
    const a = Math.max(0, Math.min(1, (TIP_SECONDS - this.tipT) / TIP_FADE_IN_S, this.tipT / TIP_FADE_OUT_S))
    this.tipGlass.opacity = a
    const c = this.tipText.textFill.color
    this.tipText.textFill.color = new vec4(c.x, c.y, c.z, a)
  }

  /** Small round icon-only toggle above the Sky button (Sky mode only): every vehicle's faint route line. Tap fades in an "All routes" glass label for 1.5 s. */
  private buildAllRoutesToggle(panel: SceneObject, pillH: number, D: number, k: number): void {
    const d = this.buttonWidthCm * 0.7
    const gap = 1 // cm above the bar
    this.toggleExtraCm = gap + d
    const root = obj(panel, "AllRoutesToggle", new vec3(0, pillH / 2 + gap + d / 2, 0))
    this.toggleRoot = root
    glassPanel(root, "AllRoutesGlass", new vec2(d, d), {tint: new vec4(0.5, 0.64, 0.86, 0.55), glow: new vec4(0.8, 0.9, 1, 0.1), edge: PALETTE.glassEdge, edgeCm: 0.12, radiusCm: d})
    const acc = glassPanel(root, "AllRoutesActive", new vec2(d, d), {tint: new vec4(1, 1, 1, 1), glow: new vec4(1, 1, 1, 0), edge: new vec4(1, 1, 1, 1), edgeCm: 0.12, radiusCm: d})
    acc.so.getTransform().setLocalPosition(new vec3(0, 0, 0.04))
    acc.so.getTransform().setLocalScale(vec3.zero())
    this.toggleActive = acc.so
    const so = obj(root, "AllRoutesButton", new vec3(0, 0, 0.1))
    const btn = so.createComponent(Button.getTypeName()) as Button
    btn.setVariant({theme: "SnapOS2", shape: "Round", style: "Ghost"})
    btn.size = new vec3(d * 1.25, d * 1.25, 1) // hit area a little larger than the drawn button
    enlargeHitArea(btn)
    const ec = so.createComponent(ElementContent.getTypeName()) as ElementContent
    ec.leadingIcon = ICON_ROUTES
    ec.iconLayout = "left"
    ec.leadingIconSize = d * 0.5
    this.toggleContent = ec
    this.tintToggleIcon(false)
    // Small glass label next to the button (right side), fades in for TIP_SECONDS when toggled
    const tipH = rowHeight("Label", D) + SPACE.xs * k
    const tipW = d * 2.1
    const tip = obj(root, "AllRoutesTip", new vec3(d / 2 + SPACE.xs * k + tipW / 2, 0, 0.2))
    const tg = glassPanel(tip, "AllRoutesTipGlass", new vec2(tipW, tipH), {radiusCm: tipH / 2, tint: GLASS_READABLE})
    this.tipGlass = tg.rect
    const tc = obj(tip, "Content", new vec3(0, 0, 0.6))
    const tcol = makeFlex(tc, "Column", FlexDirection.Column, tipW, tipH, {justify: FlexJustify.Center, align: FlexAlign.Center})
    this.tipText = addTextRow(tcol.so, tcol.flex, "TipText", "All routes", "Label", tipW, rowHeight("Label", D), TEXT.primary, D)
    tip.getTransform().setLocalScale(vec3.zero())
    this.tipRoot = tip
    btn.onTriggerUp.add(() => {
      this.setAllRoutesOn(!this.allRoutesOn)
      this._onAllRoutes.invoke(this.allRoutesOn)
      this.tipT = TIP_SECONDS
      this.applyTip()
      tip.getTransform().setLocalScale(vec3.one())
    })
    btn.onHoverEnter.add(() => this.hovered++)
    btn.onHoverExit.add(() => (this.hovered = Math.max(0, this.hovered - 1)))
    this.toggleBtn = btn
  }

  /** First-use hint: a small glass tip in the All routes button's row, left of it (lower part of the view). */
  buildHint(): void {
    if (this.hintRoot) return
    const D = this.distanceCm
    const k = D / 110
    const d = this.buttonWidthCm * 0.7 // same size as the All routes button
    const panel = this.sceneObject.getChild(0)
    const root = obj(panel, "FirstUseHintRoot", new vec3(0, this.menuHeightCm / 2 + 1 + d / 2, 0))
    const tipH = rowHeight("Label", D) + SPACE.s * k
    const tipW = d * 3.4
    const hint = obj(root, "FirstUseHint", new vec3(-(d / 2 + 1 + tipW / 2), 0, 0.2))
    glassPanel(hint, "HintGlass", new vec2(tipW, tipH), {radiusCm: tipH / 2, tint: GLASS_READABLE})
    const hc = obj(hint, "Content", new vec3(0, 0, 0.6))
    const hcol = makeFlex(hc, "Column", FlexDirection.Column, tipW, tipH, {justify: FlexJustify.Center, align: FlexAlign.Center})
    this.hintText = addTextRow(hcol.so, hcol.flex, "HintText", HINT_STEPS[0], "Label", tipW * 0.92, rowHeight("Label", D), TEXT.primary, D)
    this.hintRoot = hint
    hint.getTransform().setLocalScale(vec3.zero())
  }

  /** White icon normally; dark blue on the white filled (active) circle. */
  private tintToggleIcon(on: boolean): void {
    if (!this.toggleContent) return
    const ecAny = this.toggleContent as any
    ecAny._useThemeColors = false
    const c = on ? new vec4(0.06, 0.15, 0.4, 1) : new vec4(1, 1, 1, 0.85)
    const h = on ? c : new vec4(1, 1, 1, 1)
    ecAny._defaultIconTint = c
    ecAny._hoveredIconTint = h
    ecAny._triggeredIconTint = h
    ecAny._inactiveIconTint = c
    this.toggleContent.markColorsDirty()
  }

  /** Cluster of three round glass buttons (round 2 #7): active = accent blue, the rest pale frosted gray. */
  private build(): void {
    const D = this.distanceCm
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
    glassPanel(panel, "MenuBarGlass", new vec2(pillW, pillH), {radiusCm: Math.min(pillW, pillH) / 2, tint: GLASS_READABLE})
    const content = obj(panel, "Content", new vec3(0, 0, 0.6))
    const row = makeFlex(content, "Row", FlexDirection.Row, pillW, pillH, {gap: SPACE.l * k, justify: FlexJustify.Center, align: FlexAlign.Center})
    const icons = [ICON_SKY, ICON_RADAR, ICON_HANGAR]
    const names = ["Sky", "Radar", "Hangar"]
    const events = [this._onSky, this._onRadar, this._onHangar]
    for (let i = 0; i < 3; i++) {
      const col = makeFlex(row.so, "MenuItem_" + names[i], FlexDirection.Column, B, colH, {gap: SPACE.xs * k, justify: FlexJustify.Center, align: FlexAlign.Center})
      addFlexChild(col.so, row.flex, B, colH)
      const holder = obj(col.so, "MenuButtonHolder_" + names[i], new vec3(0, 0, 0.02))
      addFlexChild(holder, col.flex, B, B)
      // Accent disc behind the active button (calm accent blue)
      // Light glass circle under every button (inactive look), brighter than the pill behind it
      glassPanel(holder, "MenuDisc_" + names[i], new vec2(B, B), {tint: new vec4(0.5, 0.64, 0.86, 0.55), glow: new vec4(0.8, 0.9, 1, 0.1), edge: PALETTE.glassEdge, edgeCm: 0.12, radiusCm: B})
      // Solid bright accent fill for the active button
      const acc = glassPanel(holder, "MenuActive_" + names[i], new vec2(B * 1.04, B * 1.04), {tint: new vec4(0.3, 0.62, 1.0, 0.96), glow: new vec4(0.7, 0.88, 1, 0.35), edge: new vec4(1, 1, 1, 0.95), edgeCm: 0.16, radiusCm: B})
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
      if (i === 0) {
        btn.onTriggerUp.add(() => {
          const now = getTime()
          if (now - this.lastSkyTap < DOUBLE_TAP_SECONDS) { this.lastSkyTap = -10; this.showHint() } else this.lastSkyTap = now
        })
      }
      btn.onHoverEnter.add(() => this.hovered++)
      btn.onHoverExit.add(() => (this.hovered = Math.max(0, this.hovered - 1)))
      this.buttons.push(btn)
      this.contents.push(ec)
      this.labelTexts.push(addTextRow(col.so, col.flex, "MenuLabel_" + names[i], this.labels[i] ?? names[i], "HeadlineXL", B * 1.4, labelH, TEXT.primary, D))
    }
    this.buildAllRoutesToggle(panel, pillH, D, k)
  }

  private update(): void {
    if (!this.cameraObject) return
    this.frames++
    if (this.modeDirty && this.frames > 3) {
      this.modeDirty = false
      this.setActiveMode(this.mode)
    }
    const dt = getDeltaTime()
    if (!this.hintStarted && this.frames > 6 && this.hintRoot) {
      this.hintStarted = true
      this.showHint()
    }
    if (this.hintStep >= 0) {
      this.hintT += dt
      if (this.hintT >= HINT_STEP_SECONDS) {
        this.hintT = 0
        if (this.hintStep + 1 >= HINT_STEPS.length) this.dismissHint()
        else { this.hintStep++; this.applyHint() }
      }
    }
    if (this.tipT > 0) {
      this.tipT -= dt
      if (this.tipT <= 0 && this.tipRoot) this.tipRoot.getTransform().setLocalScale(vec3.zero())
      else this.applyTip()
    }
    const ct = this.cameraObject.getTransform()
    const camPos = ct.getWorldPosition()
    const camRot = ct.getWorldRotation()
    const fwd = camRot.multiplyVec3(new vec3(0, 0, -1))
    // Ideal spot: a fixed point below the view centre (head-relative).
    const b = (this.belowViewDeg * Math.PI) / 180
    const idealLocal = new vec3(0, -Math.sin(b) * this.distanceCm, -Math.cos(b) * this.distanceCm)
    const ideal = camPos.add(camRot.multiplyVec3(idealLocal))
    const tr = this.sceneObject.getTransform()
    if (!this.placed) {
      tr.setWorldPosition(ideal)
      this.placed = true
    }
    // Lazy follow: start drifting once the bar is off its spot by more than the deadzone, then settle.
    const cur = tr.getWorldPosition()
    const curDir = cur.sub(camPos).normalize()
    const idealDir = ideal.sub(camPos).normalize()
    const off = (Math.acos(Math.max(-1, Math.min(1, curDir.dot(idealDir)))) * 180) / Math.PI
    if (off > this.driftDeadzoneDeg) this.drifting = true
    if (this.drifting) {
      const k = 1 - Math.exp((-dt * 4.6) / this.settleSeconds) // ~99% settled after settleSeconds
      tr.setWorldPosition(vec3.lerp(cur, ideal, k))
      if (off < 0.5) this.drifting = false
    } else {
      // Keep the distance right even when not drifting (e.g. walking).
      tr.setWorldPosition(camPos.add(curDir.uniformScale(this.distanceCm)))
    }
    const toCam = camPos.sub(tr.getWorldPosition())
    if (toCam.length > 0.01) tr.setWorldRotation(quat.lookAt(toCam.normalize(), camRot.multiplyVec3(vec3.up())))

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
      for (const c of this.contents) c.opacity = op
      if (this.toggleBtn) this.toggleBtn.opacity = op
      if (this.toggleContent) this.toggleContent.opacity = op
    }
  }
}
