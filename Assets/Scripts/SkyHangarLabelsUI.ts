// SkyHangarLabelsUI.ts
// Owns: the world-space text that floats in the scene — trail end labels (origin / destination
// airport codes), the label on the nearest-aircraft edge arrow, and the "Collected" stamp on the pad.
// Each label is a small FlexLayout column (code + caption) that faces the user; sized by distance.
// Public API: setTrailLabels(...), hideTrailLabels(), setArrowLabel(...), showCollectedStamp(pos),
// plus getters for tests. Passive view — positions and strings come from the main script.

import {RoundedRectangle, RoundedRectBlendMode} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {textWidthEm, emCm, GLASS_READABLE, GLASS, PALETTE, RADIUS, TEXT, addTextRow, applyTextRole, fontFor, opticalLiftCm, glassPanel, glassSurface, makeFlex, obj, roleHeightCm, rowHeight, UI_RENDER_ORDER, setRenderOrderTree, FlexDirection, FlexJustify, FlexAlign} from "./SkyHangarSharedUI"

interface Label {
  root: SceneObject
  big: Text
  small: Text | null
  visible: boolean
  distance: number
}

const RETICLE_SCALE = 0.72 // the aimed label (callsign / type / route / timing block) is 28% smaller than its authored size, layout unchanged

@component
export class SkyHangarLabelsUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarLabelsUI – trail codes, arrow label, stamp</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("The main camera SceneObject (labels face it)")
  cameraObject!: SceneObject
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input("vec4", "{0.85, 0.95, 1.0, 1}")
  @hint("Trail label colour")
  @widget(new ColorWidget())
  trailLabelColor: vec4 = new vec4(0.85, 0.95, 1.0, 1)
  @input("vec4", "{0.95, 0.97, 1.0, 1}")
  @hint("Edge-arrow label colour (soft white)")
  @widget(new ColorWidget())
  arrowLabelTint: vec4 = new vec4(0.95, 0.97, 1.0, 1)
  @input("vec4", "{0.45, 1.0, 0.6, 1}")
  @hint("Collected stamp colour")
  @widget(new ColorWidget())
  stampColor: vec4 = new vec4(0.45, 1.0, 0.6, 1)
  @input
  @hint("Collected stamp text")
  stampText: string = "Collected"
  @input
  @hint("Seconds the Collected stamp stays up")
  @widget(new SliderWidget(0.5, 5, 0.1))
  stampSeconds: number = 2.0
  @input
  @hint("Label shown under the hangar pad")
  hangarPadText: string = "Hangar"
  @input
  @hint("Label shown above the Sky return pad")
  skyPadText: string = "Sky"
  @input("vec4", "{0.9, 0.96, 1.0, 1}")
  @hint("Pad label colour")
  @widget(new ColorWidget())
  padLabelColor: vec4 = new vec4(0.9, 0.96, 1.0, 1)
  @input("vec4", "{1, 1, 1, 1}")
  @hint("Aim reticle label colour")
  @widget(new ColorWidget())
  reticleLabelColor: vec4 = new vec4(1, 1, 1, 1)
  @input
  @hint("Aim reticle label block width at the sky dome, cm")
  @widget(new SliderWidget(20, 150, 1))
  reticleBlockWidthCm: number = 90
  @ui.group_end

  private origin!: Label
  private dest!: Label
  private arrow!: Label
  private stamp!: Label
  private stampT = 99
  // coaching hint: one small glass pill just above the bottom menu (head-locked, fades in / out)
  private hint!: Label
  private hintGlass!: ReturnType<typeof glassSurface>
  private hintText = ""
  private hintAlpha = 0
  private hintTarget = 0
  private hintHolder: SceneObject | null = null // child of the menu bar's root; the pill is parented to it
  private trailVisible = false
  private reticle!: Label
  private reticleRows: Text[] = []
  private reticleSmoothed: vec3 | null = null
  private reticleSide = 1
  private reticleCand = -1
  private reticleScoreT = -1
  private skyFade = 1
  private skyFadeTarget = 1
  private radarDim = 1
  private fadeCache = new Map<Label, {texts: Text[]; base: vec4[]; rects: RoundedRectangle[]}>()
  private hangarPadLabel!: Label
  private skyPadLabel!: Label
  private skyPadCaption!: Label
  private skyPadRelease = false
  private radarLabels: Label[] = []

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas")
    // Trail labels are read ~4.5 m away; arrow label ~0.8 m; stamp ~0.6 m.
    this.origin = this.makeLabel("TrailOriginLabel", 400, "LHR", "London", TEXT.primary, 12, true, GLASS_READABLE)
    this.dest = this.makeLabel("TrailDestLabel", 400, "CUN", "Cancún", TEXT.primary, 12, true, GLASS_READABLE)
    this.arrow = this.makeLabel("EdgeArrowLabel", 80, "Swiss International Air Lines LX29K", null, this.arrowLabelTint, 36)
    this.stamp = this.makeStamp(60, this.stampText, "Ealing, London", 22)
    this.reticle = this.makeReticleLabel()
    this.hint = this.makeHint()
    for (let i = 0; i < 4; i++) this.radarLabels.push(this.makeLabel("RadarRangeLabel_" + i, 100, "20 km", null, this.padLabelColor, 8))
    this.hangarPadLabel = this.makeLabel("HangarPadLabel", 60, this.hangarPadText, null, this.padLabelColor, 12, true)
    this.skyPadLabel = this.makeLabel("SkyPadLabel", 60, this.skyPadText, null, this.padLabelColor, 12, true)
    this.skyPadCaption = this.makeLabel("SkyPadCaption", 60, "Returns it to the sky and", "removes it from your Hangar.", this.padLabelColor, 26)
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  // ---------- public API ----------
  isTrailLabelsVisible(): boolean { return this.trailVisible }
  getTrailLabelText(): string { return this.trailVisible ? this.origin.big.text + " → " + this.dest.big.text : "" }
  getArrowLabelText(): string { return this.arrow.visible ? this.arrow.big.text : "" }
  isStampVisible(): boolean { return this.stamp.visible }
  isReticleLabelVisible(): boolean { return this.reticle.visible }
  /** "callsign | code · type | ORIGIN > DEST | Departed … ago · Arriving in …" ("" when hidden). */
  getReticleLabelText(): string { return this.reticle.visible ? this.reticleRows.map((t) => t.text).join(" | ") : "" }
  getReticleLabelWorldPos(): vec3 { return this.reticle.root.getTransform().getWorldPosition() }
  /** In the Hangar the sky pad reads "Release" with a small caption (it removes the model from the Hangar); otherwise "Sky". */
  setSkyPadRelease(on: boolean): void {
    if (on === this.skyPadRelease) return
    this.skyPadRelease = on
    this.skyPadLabel.big.text = on ? "Release" : this.skyPadText
    if (!on && this.skyPadCaption.visible) this.hideLabel(this.skyPadCaption)
  }
  getSkyPadLabelText(): string { return this.skyPadLabel.big.text }
  getSkyPadCaptionText(): string { return this.skyPadCaption.visible ? [this.skyPadCaption.big.text, this.skyPadCaption.small ? this.skyPadCaption.small.text : ""].join(" ") : "" }
  arePadLabelsVisible(): boolean { return this.hangarPadLabel.visible && this.skyPadLabel.visible }

  /**
   * Aim reticle label block beside the aimed object. lines: [callsign, code · type, ORIGIN > DEST, timing].
   * leftEdgeWorld is where the block's left edge should sit (the main script puts it just right of the brackets).
   */
  setReticleLabel(lines: string[] | null, anchorWorld: vec3, visible: boolean, offsetCm: number = 0, avoidWorld: vec3[] = []): void {
    if (!visible || !lines) {
      this.hideLabel(this.reticle)
      this.reticleSmoothed = null
      this.reticleCand = -1
      return
    }
    for (let i = 0; i < this.reticleRows.length; i++) {
      const v = lines[i] ?? ""
      if (this.reticleRows[i].text !== v) this.reticleRows[i].text = v
    }
    // The block goes to whichever side of the brackets keeps the trail (avoidWorld = points along the route) out of it:
    // right, left, above, below, then the four diagonals; the previous choice is kept while it stays clear.
    const cam = this.cameraObject.getTransform()
    const camRot = cam.getWorldRotation()
    const inv = camRot.invert()
    const right = camRot.multiplyVec3(vec3.right())
    const up = camRot.multiplyVec3(vec3.up())
    const hw = (this.reticleBlockWidthCm / 2) * RETICLE_SCALE // the block is drawn 28% smaller (uniformly), so it takes that much less room
    const D = 400
    const hh = ((2 * rowHeight("Title", D) + 2 * rowHeight("Label", D) + 0.3 * (D / 110)) / 2) * RETICLE_SCALE
    const margin = 3
    const o = offsetCm
    const cands: [number, number][] = [
      [o + hw, 0], [-(o + hw), 0], [0, o + hh], [0, -(o + hh)],
      [o * 0.5 + hw, o * 0.5 + hh], [-(o * 0.5 + hw), o * 0.5 + hh], [o * 0.5 + hw, -(o * 0.5 + hh)], [-(o * 0.5 + hw), -(o * 0.5 + hh)]
    ]
    const local = inv.multiplyVec3(anchorWorld.sub(cam.getWorldPosition()))
    const maxX = -local.z * Math.tan(MathUtils.DegToRad * 20)
    const maxY = -local.z * Math.tan(MathUtils.DegToRad * 17)
    let ptsCache: vec2[] | null = null // built only when the side is re-decided (10 Hz), not every frame
    const score = (c: [number, number]): number => {
      const pts = ptsCache ?? (ptsCache = avoidWorld.map((q) => {
        const r = inv.multiplyVec3(q.sub(anchorWorld))
        return new vec2(r.x, r.y)
      }))
      let hits = 0
      if (Math.abs(local.x + c[0]) + hw > maxX || Math.abs(local.y + c[1]) + hh > maxY) hits += 100 // would leave the display
      const inside = (x: number, y: number) => Math.abs(x - c[0]) < hw + margin && Math.abs(y - c[1]) < hh + margin
      for (let k = 0; k < pts.length; k++) {
        if (inside(pts[k].x, pts[k].y)) hits++
        if (k > 0 && inside((pts[k].x + pts[k - 1].x) / 2, (pts[k].y + pts[k - 1].y) / 2)) hits++
      }
      return hits
    }
    let best = this.reticleCand
    const nowT = getTime()
    if (best < 0 || nowT - this.reticleScoreT >= 0.1) { // which side of the brackets is clear of the trail is re-decided 10 times a second (the block still follows the anchor every frame)
      this.reticleScoreT = nowT
      const scores = cands.map(score)
      best = 0
      for (let i = 1; i < cands.length; i++) if (scores[i] < scores[best]) best = i
      if (this.reticleCand >= 0 && scores[this.reticleCand] <= scores[best]) best = this.reticleCand
    }
    this.reticleCand = best
    const c = cands[best]
    const target = anchorWorld.add(right.uniformScale(c[0])).add(up.uniformScale(c[1]))
    this.reticleSide = c[0] >= 0 ? 1 : -1
    const first = !this.reticleSmoothed
    this.reticleSmoothed = first ? target : vec3.lerp(this.reticleSmoothed!, target, Math.min(1, getDeltaTime() * 14))
    this.place(this.reticle, this.reticleSmoothed!)
  }

  /** Radar range-ring labels (same type scale). Pass [] to hide. */
  setRadarLabels(items: {pos: vec3; text: string}[]): void {
    for (let i = 0; i < this.radarLabels.length; i++) {
      const l = this.radarLabels[i]
      const it = items[i]
      if (!it) {
        if (l.visible) this.hideLabel(l)
        continue
      }
      if (l.big.text !== it.text) l.big.text = it.text
      this.place(l, it.pos)
    }
  }
  /** Airport tags and the reticle label fade out (0.2 s) while the radar or a card is up, and back in when closed. */
  setSkyTagsVisible(on: boolean): void { this.skyFadeTarget = on ? 1 : 0 }
  /** Radar range labels follow the radar's dimming. */
  setRadarDim(a: number): void {
    if (Math.abs(a - this.radarDim) < 0.002) return
    this.radarDim = a
    for (const l of this.radarLabels) this.setAlpha(l, a)
  }
  /** UI-layer labels (pads, stamp, radar ranges) render in front of the world-space sky tags. */
  applyUiOrder(): void {
    for (const l of [this.hangarPadLabel, this.skyPadLabel, this.skyPadCaption, this.stamp, this.hint, ...this.radarLabels]) setRenderOrderTree(l.root, UI_RENDER_ORDER)
  }

  private setAlpha(l: Label, a: number): void {
    let c = this.fadeCache.get(l)
    if (!c) {
      c = {texts: [], base: [], rects: []}
      const walk = (so: SceneObject) => {
        const t = so.getComponent("Component.Text") as Text | null
        if (t) { c!.texts.push(t); c!.base.push(t.textFill.color) }
        const r = so.getComponent(RoundedRectangle.getTypeName()) as RoundedRectangle | null
        if (r) c!.rects.push(r)
        for (let i = 0; i < so.getChildrenCount(); i++) walk(so.getChild(i))
      }
      walk(l.root)
      this.fadeCache.set(l, c)
    }
    for (let i = 0; i < c.texts.length; i++) c.texts[i].textFill.color = new vec4(c.base[i].x, c.base[i].y, c.base[i].z, c.base[i].w * a)
    for (const r of c.rects) r.opacity = a
  }

  getRadarLabelTexts(): string[] { return this.radarLabels.filter((l) => l.visible).map((l) => l.big.text) }

  /** Labels under the hangar pad and above the Sky pad (visible only while holding). */
  setPadLabels(hangarPos: vec3, skyPos: vec3, visible: boolean, hangarRot?: quat, skyRot?: quat): void {
    if (!visible) {
      if (this.hangarPadLabel.visible) this.hideLabel(this.hangarPadLabel)
      if (this.skyPadLabel.visible) this.hideLabel(this.skyPadLabel)
      if (this.skyPadCaption.visible) this.hideLabel(this.skyPadCaption)
      return
    }
    this.place(this.hangarPadLabel, hangarPos)
    this.place(this.skyPadLabel, skyPos)
    // Level with the pads: same rotation as the pad itself.
    if (hangarRot) this.hangarPadLabel.root.getTransform().setWorldRotation(hangarRot)
    if (skyRot) this.skyPadLabel.root.getTransform().setWorldRotation(skyRot)
    if (this.skyPadRelease) {
      const r = skyRot ?? quat.quatIdentity()
      this.place(this.skyPadCaption, skyPos.add(r.multiplyVec3(new vec3(0, -4.4, 0))))
      this.skyPadCaption.root.getTransform().setWorldRotation(r)
    } else if (this.skyPadCaption.visible) this.hideLabel(this.skyPadCaption)
  }

  /** A null position hides that tag (airport out of visible range). */
  setTrailLabels(originPos: vec3 | null, originCode: string, originCity: string, destPos: vec3 | null, destCode: string, destCity: string): void {
    this.origin.big.text = originCode
    if (this.origin.small) this.origin.small.text = originCity
    this.dest.big.text = destCode
    if (this.dest.small) this.dest.small.text = destCity
    if (originPos) this.place(this.origin, originPos)
    else this.hideLabel(this.origin)
    if (destPos) this.place(this.dest, destPos)
    else this.hideLabel(this.dest)
    this.trailVisible = !!(originPos || destPos)
  }

  hideTrailLabels(): void {
    this.hideLabel(this.origin)
    this.hideLabel(this.dest)
    this.trailVisible = false
  }

  setArrowLabel(text: string, worldPos: vec3, visible: boolean): void {
    if (!visible || !text) {
      this.hideLabel(this.arrow)
      return
    }
    if (this.arrow.big.text !== text) this.arrow.big.text = text
    this.place(this.arrow, worldPos)
  }

  showCollectedStamp(worldPos: vec3, caption: string): void {
    if (this.stamp.small) this.stamp.small.text = caption
    this.setAlpha(this.stamp, 0)
    this.place(this.stamp, worldPos)
    this.stampT = 0
  }

  /**
   * Parent the hint pill to the bottom menu bar's root (the object its lazy follow moves), centred on it and HINT_GAP_CM above its top edge.
   * From then on the pill moves, turns, scales and smooths exactly with the menu; it has no follow logic of its own.
   * The holder is scaled so the pill keeps its size as seen from the menu's distance (the pill is authored for HINT_D cm).
   */
  attachHintTo(menuRoot: SceneObject, menuTopCm: number, menuDistCm: number): void {
    const holder = obj(menuRoot, "HintHolder", new vec3(0, menuTopCm + SkyHangarLabelsUI.HINT_GAP_CM, 0.3))
    const s = menuDistCm / SkyHangarLabelsUI.HINT_D
    holder.getTransform().setLocalScale(new vec3(s, s, s))
    this.hint.root.setParent(holder)
    this.hint.root.getTransform().setLocalRotation(quat.quatIdentity())
    this.hintHolder = holder
    this.layoutHint()
  }
  /** The coaching hint to show (null = fade it out). */
  setHint(text: string | null): void {
    if (text) {
      if (text !== this.hintText) this.applyHintText(text)
      this.hintTarget = 1
    } else this.hintTarget = 0
  }
  getHintText(): string { return this.hint && this.hint.visible ? this.hintText : "" }
  getHintAlpha(): number { return this.hintAlpha }
  getHintWorldPos(): vec3 { return this.hint.root.getTransform().getWorldPosition() }

  // ---------- internals ----------
  private static readonly HINT_D = 90 // the distance the pill's type and size are authored for, cm
  private static readonly HINT_GAP_CM = 1 // gap between the menu's top edge and the pill's bottom edge (menu units)
  private hintHeightCm(): number { return emCm(this.hint.big.size) * 1.7 }
  /** The pill sits on the holder (its bottom edge on the holder origin, centred horizontally). */
  private layoutHint(): void {
    if (this.hintHolder) this.hint.root.getTransform().setLocalPosition(new vec3(0, this.hintHeightCm() / 2, 0))
  }

  /** A small frosted-glass pill with one short line of text (same glass + type as the Collected toast, just smaller). */
  private makeHint(): Label {
    const D = SkyHangarLabelsUI.HINT_D
    const root = obj(this.sceneObject, "HintPill")
    const glass = glassSurface(root, "HintGlass", new vec2(10, 2), {radiusCm: 1, glow: false})
    this.hintGlass = glass
    const content = obj(root, "Content", new vec3(0, 0, 0.6))
    const so = obj(content, "Text", vec3.zero())
    const t = so.createComponent("Component.Text") as Text
    t.text = ""
    t.depthTest = true
    applyTextRole(t, "Label", D)
    t.textFill.color = new vec4(1, 1, 1, 0.95)
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Shrink
    t.verticalOverflow = VerticalOverflow.Overflow
    root.getTransform().setLocalScale(vec3.zero())
    return {root, big: t, small: null, visible: false, distance: D}
  }

  private applyHintText(text: string): void {
    this.hintText = text
    const t = this.hint.big
    t.text = text
    const D = SkyHangarLabelsUI.HINT_D
    const k = D / 110
    const em = emCm(t.size)
    const h = this.hintHeightCm()
    const w = textWidthEm(text) * em + 2 * 1.6 * k + 1.2 * em
    this.hintGlass.resize(new vec2(w, h))
    this.hintGlass.rect.cornerRadius = h / 2
    const lift = opticalLiftCm(text, t.size)
    t.layoutRect = Rect.create(-w / 2 + 0.8 * k, w / 2 - 0.8 * k, -h / 2 + lift, h / 2 + lift)
    this.layoutHint()
  }

  /** Per frame: only the fade in / out. Position, rotation and smoothing come from the menu bar the pill is parented to. */
  private updateHint(dt: number): void {
    const step = dt / 0.25
    this.hintAlpha = this.hintTarget > this.hintAlpha ? Math.min(this.hintTarget, this.hintAlpha + step) : Math.max(this.hintTarget, this.hintAlpha - step)
    if ((this.hintAlpha <= 0.001 && this.hintTarget === 0) || !this.hintHolder) {
      if (this.hint.visible) this.hideLabel(this.hint)
      return
    }
    if (!this.hint.visible) {
      this.hint.visible = true
      this.hint.root.getTransform().setLocalScale(vec3.one())
    }
    this.setAlpha(this.hint, this.hintAlpha * this.hintAlpha * (3 - 2 * this.hintAlpha))
  }

  /** Left-aligned four-row block: callsign (large), code + type (small), ORIGIN > DEST (large), timing (small). */
  private makeReticleLabel(): Label {
    const D = 400
    const k = D / 110
    const w = this.reticleBlockWidthCm
    const root = obj(this.sceneObject, "AimReticleLabel")
    const content = obj(root, "Content", new vec3(0, 0, 0.6))
    const col = makeFlex(content, "Column", FlexDirection.Column, w, -1, {gap: 0.1 * k, justify: FlexJustify.Center, align: FlexAlign.Start})
    const c = this.reticleLabelColor
    const dim = new vec4(c.x, c.y, c.z, 0.75)
    const L = HorizontalAlignment.Left
    this.reticleRows = [
      addTextRow(col.so, col.flex, "Callsign", "EZY26DV", "Title", w, rowHeight("Title", D), c, D, L),
      addTextRow(col.so, col.flex, "CodeType", "EZY · A320", "Label", w, rowHeight("Label", D), dim, D, L),
      addTextRow(col.so, col.flex, "Route", "LTN > NAP", "Title", w, rowHeight("Title", D), c, D, L),
      addTextRow(col.so, col.flex, "Timing", "Departed 0:21 ago · Arriving in 2:23", "Label", w, rowHeight("Label", D), dim, D, L)
    ]
    root.getTransform().setLocalScale(vec3.zero())
    return {root, big: this.reticleRows[0], small: this.reticleRows[2], visible: false, distance: D}
  }

  /** "Collected" toast: frosted glass pill, small line check + medium-weight white title, quieter detail line (flight, date). */
  private makeStamp(distance: number, title: string, caption: string, widthAt110: number): Label {
    const k = distance / 110
    const w = widthAt110 * k
    const titleH = rowHeight("Title", distance)
    const capH = rowHeight("Label", distance)
    const h = titleH + capH + 1.0 * k
    const root = obj(this.sceneObject, "CollectedStamp")
    glassSurface(root, "CollectedStampGlass", new vec2(w, h), {radiusCm: h / 2, glow: false})
    const content = obj(root, "Content", new vec3(0, 0, 0.6))
    const mkText = (name: string, text: string, role: "Title" | "Label", weight: number, color: vec4, cx: number, cy: number, tw: number, th: number, align: HorizontalAlignment): Text => {
      const so = obj(content, name, new vec3(0, cy, 0))
      const t = so.createComponent("Component.Text") as Text
      t.text = text
      t.depthTest = true
      applyTextRole(t, role, distance)
      t.font = fontFor(weight)
      t.textFill.color = color
      t.horizontalAlignment = align
      t.verticalAlignment = VerticalAlignment.Center
      t.horizontalOverflow = HorizontalOverflow.Shrink
      t.verticalOverflow = VerticalOverflow.Overflow
      const lift = opticalLiftCm(text, t.size)
      t.layoutRect = Rect.create(cx - tw / 2, cx + tw / 2, -th / 2 + lift, th / 2 + lift)
      return t
    }
    const label = title.charAt(0).toUpperCase() + title.slice(1).toLowerCase()
    const em = roleHeightCm("Title", distance)
    const iconS = em * 0.8
    const gap = em * 0.4
    const textW = em * 5.6
    const x0 = -(iconS + gap + textW) / 2
    const cy = capH / 2 // the title row sits above the caption row
    const big = mkText("Title", label, "Title", 500, new vec4(1, 1, 1, 1), x0 + iconS + gap + textW / 2, cy, textW, titleH, HorizontalAlignment.Left)
    const small = mkText("Caption", caption, "Label", 400, new vec4(1, 1, 1, 0.72), 0, -titleH / 2, w * 0.92, capH, HorizontalAlignment.Center)
    // Line check (round-capped 2 px strokes): two segments through A -> B -> C
    const cx = x0 + iconS / 2
    const pts = [new vec2(cx - 0.38 * iconS, cy + 0.0), new vec2(cx - 0.1 * iconS, cy - 0.3 * iconS), new vec2(cx + 0.4 * iconS, cy + 0.3 * iconS)]
    const th = Math.max(0.12, em * 0.1)
    for (let i = 0; i < 2; i++) {
      const a = pts[i], b = pts[i + 1]
      const so = obj(content, "Check" + i, new vec3((a.x + b.x) / 2, (a.y + b.y) / 2, 0))
      const r = so.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
      r.initialize()
      r.blendMode = RoundedRectBlendMode.Normal
      r.size = new vec2(Math.hypot(b.x - a.x, b.y - a.y) + th, th)
      r.cornerRadius = th / 2
      r.backgroundColor = new vec4(1, 1, 1, 0.95)
      so.getTransform().setLocalRotation(quat.angleAxis(Math.atan2(b.y - a.y, b.x - a.x), vec3.forward()))
    }
    root.getTransform().setLocalScale(vec3.zero())
    return {root, big, small, visible: false, distance}
  }

  private makeLabel(name: string, distance: number, big: string, small: string | null, color: vec4, widthAt110: number, plate: boolean = false, plateTint?: vec4): Label {
    const root = obj(this.sceneObject, name)
    const k = distance / 110
    const w = widthAt110 * k
    let glass: RoundedRectangle | null = null
    if (plate) glass = glassPanel(root, name + "Glass", new vec2(w, 4 * k), {radiusCm: RADIUS.m * k, tint: plateTint}).rect
    if (name.endsWith("PadLabel")) {
      // Pad labels skip the flex column (it anchors off-centre): one centred text row on a centred plate.
      const h = rowHeight("Headline", distance)
      const tw = Math.max(w * 0.7, 1)
      if (glass) { glass.size = new vec2(tw, h + 1.2 * k); glass.cornerRadius = Math.min((h + 1.2 * k) / 2, RADIUS.l * k) }
      const so = obj(root, "Code", new vec3(0, 0, 0.6))
      const t = so.createComponent("Component.Text") as Text
      t.text = big
      t.depthTest = true
      applyTextRole(t, "Headline", distance)
      t.textFill.color = color
      t.horizontalAlignment = HorizontalAlignment.Center
      t.verticalAlignment = VerticalAlignment.Center
      t.horizontalOverflow = HorizontalOverflow.Shrink
      t.verticalOverflow = VerticalOverflow.Overflow
      const lift = opticalLiftCm(big, t.size)
      t.layoutRect = Rect.create(-tw / 2, tw / 2, -h / 2 + lift, h / 2 + lift)
      root.getTransform().setLocalScale(vec3.zero())
      return {root, big: t, small: null, visible: false, distance}
    }
    const content = obj(root, "Content", new vec3(0, 0, 0.6))
    const col = makeFlex(content, "Column", FlexDirection.Column, w, -1, {gap: 0.1 * k, padY: 0.6 * k, padX: 0.8 * k, justify: FlexJustify.Center, align: FlexAlign.Center})
    if (glass) {
      const g = glass
      col.flex.onLayoutComplete.add((res) => {
        g.size = new vec2(res.containerWidth, res.containerHeight)
        g.cornerRadius = Math.min(res.containerHeight / 2, RADIUS.l * k)
      })
    }
    const role = name.indexOf("RadarRangeLabel") === 0 ? "Label" : name === "EdgeArrowLabel" ? "Headline" : name === "SkyPadCaption" ? "Label" : plate && name !== "CollectedStamp" ? "Headline" : "Title"
    const bigT = addTextRow(col.so, col.flex, "Code", big, role, w, rowHeight(role, distance), color, distance)
    let smallT: Text | null = null
    if (small !== null) smallT = addTextRow(col.so, col.flex, "Caption", small, "Label", w, rowHeight("Label", distance), new vec4(color.x, color.y, color.z, 0.8), distance)
    root.getTransform().setLocalScale(vec3.zero())
    return {root, big: bigT, small: smallT, visible: false, distance}
  }

  private place(l: Label, pos: vec3): void {
    l.visible = true
    l.root.getTransform().setWorldPosition(pos)
    const s = l === this.reticle ? RETICLE_SCALE : 1
    l.root.getTransform().setLocalScale(new vec3(s, s, s))
  }

  private hideLabel(l: Label): void {
    l.visible = false
    l.root.getTransform().setLocalScale(vec3.zero())
  }

  private update(): void {
    if (!this.cameraObject) return
    const cam = this.cameraObject.getTransform()
    const camPos = cam.getWorldPosition()
    const camRot = cam.getWorldRotation()
    if (this.skyFade !== this.skyFadeTarget) {
      const step = getDeltaTime() / 0.2
      this.skyFade = this.skyFade < this.skyFadeTarget ? Math.min(this.skyFadeTarget, this.skyFade + step) : Math.max(this.skyFadeTarget, this.skyFade - step)
      for (const l of [this.origin, this.dest, this.reticle]) this.setAlpha(l, this.skyFade)
    }
    this.updateHint(getDeltaTime())
    if (this.reticle.visible) l2(this.reticle.root, camRot)
    for (const l of [this.origin, this.dest, this.stamp, this.hangarPadLabel, this.skyPadLabel, this.skyPadCaption, ...this.radarLabels]) {
      if (!l.visible) continue
      if (l === this.hangarPadLabel || l === this.skyPadLabel || l === this.skyPadCaption) continue
      const d = camPos.sub(l.root.getTransform().getWorldPosition())
      if (d.length > 0.01) l.root.getTransform().setWorldRotation(quat.lookAt(d.normalize(), vec3.up()))
    }
    // The arrow label is part of the head-locked edge cue: align with the view.
    if (this.arrow.visible) l2(this.arrow.root, camRot)
    if (this.stamp.visible) {
      this.stampT += getDeltaTime()
      // Fade + scale 94% -> 100% over 0.25 s, hold, then fade out over the last 0.3 s
      const inT = Math.min(1, this.stampT / 0.25)
      const ease = 1 - (1 - inT) * (1 - inT)
      const pop = 0.94 + 0.06 * ease
      this.setAlpha(this.stamp, ease * Math.max(0, Math.min(1, (this.stampSeconds - this.stampT) / 0.3)))
      this.stamp.root.getTransform().setLocalScale(new vec3(pop, pop, pop))
      if (this.stampT > this.stampSeconds) this.hideLabel(this.stamp)
    }
  }
}

function l2(root: SceneObject, camRot: quat): void {
  root.getTransform().setWorldRotation(camRot)
}

