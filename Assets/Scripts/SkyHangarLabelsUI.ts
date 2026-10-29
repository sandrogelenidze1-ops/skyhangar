// SkyHangarLabelsUI.ts
// Owns: the world-space text that floats in the scene — trail end labels (origin / destination
// airport codes), the label on the nearest-aircraft edge arrow, and the "Collected" stamp on the pad.
// Each label is a small FlexLayout column (code + caption) that faces the user; sized by distance.
// Public API: setTrailLabels(...), hideTrailLabels(), setArrowLabel(...), showCollectedStamp(pos),
// plus getters for tests. Passive view — positions and strings come from the main script.

import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {GLASS_READABLE, PALETTE, RADIUS, TEXT, addTextRow, applyTextRole, glassPanel, makeFlex, obj, rowHeight, FlexDirection, FlexJustify, FlexAlign} from "./SkyHangarSharedUI"

interface Label {
  root: SceneObject
  big: Text
  small: Text | null
  visible: boolean
  distance: number
}

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
  stampText: string = "COLLECTED"
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
  private trailVisible = false
  private reticle!: Label
  private reticleRows: Text[] = []
  private hangarPadLabel!: Label
  private skyPadLabel!: Label
  private radarLabels: Label[] = []

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas")
    // Trail labels are read ~4.5 m away; arrow label ~0.8 m; stamp ~0.6 m.
    this.origin = this.makeLabel("TrailOriginLabel", 400, "LHR", "London", TEXT.primary, 12, true, GLASS_READABLE)
    this.dest = this.makeLabel("TrailDestLabel", 400, "CUN", "Cancún", TEXT.primary, 12, true, GLASS_READABLE)
    this.arrow = this.makeLabel("EdgeArrowLabel", 80, "Swiss International Air Lines LX29K", null, this.arrowLabelTint, 36)
    this.stamp = this.makeLabel("CollectedStamp", 60, this.stampText, "Ealing, London", this.stampColor, 22, true)
    this.reticle = this.makeReticleLabel()
    for (let i = 0; i < 4; i++) this.radarLabels.push(this.makeLabel("RadarRangeLabel_" + i, 100, "20 km", null, this.padLabelColor, 8))
    this.hangarPadLabel = this.makeLabel("HangarPadLabel", 60, this.hangarPadText, null, this.padLabelColor, 12, true)
    this.skyPadLabel = this.makeLabel("SkyPadLabel", 60, this.skyPadText, null, this.padLabelColor, 12, true)
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
  arePadLabelsVisible(): boolean { return this.hangarPadLabel.visible && this.skyPadLabel.visible }

  /**
   * Aim reticle label block beside the aimed object. lines: [callsign, code · type, ORIGIN > DEST, timing].
   * leftEdgeWorld is where the block's left edge should sit (the main script puts it just right of the brackets).
   */
  setReticleLabel(lines: string[] | null, leftEdgeWorld: vec3, visible: boolean): void {
    if (!visible || !lines) {
      this.hideLabel(this.reticle)
      return
    }
    for (let i = 0; i < this.reticleRows.length; i++) {
      const v = lines[i] ?? ""
      if (this.reticleRows[i].text !== v) this.reticleRows[i].text = v
    }
    const cam = this.cameraObject.getTransform()
    const right = cam.getWorldRotation().multiplyVec3(vec3.right())
    this.place(this.reticle, leftEdgeWorld.add(right.uniformScale(this.reticleBlockWidthCm / 2)))
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
  getRadarLabelTexts(): string[] { return this.radarLabels.filter((l) => l.visible).map((l) => l.big.text) }

  /** Labels under the hangar pad and above the Sky pad (visible only while holding). */
  setPadLabels(hangarPos: vec3, skyPos: vec3, visible: boolean, hangarRot?: quat, skyRot?: quat): void {
    if (!visible) {
      if (this.hangarPadLabel.visible) this.hideLabel(this.hangarPadLabel)
      if (this.skyPadLabel.visible) this.hideLabel(this.skyPadLabel)
      return
    }
    this.place(this.hangarPadLabel, hangarPos)
    this.place(this.skyPadLabel, skyPos)
    // Level with the pads: same rotation as the pad itself.
    if (hangarRot) this.hangarPadLabel.root.getTransform().setWorldRotation(hangarRot)
    if (skyRot) this.skyPadLabel.root.getTransform().setWorldRotation(skyRot)
  }

  setTrailLabels(originPos: vec3, originCode: string, originCity: string, destPos: vec3, destCode: string, destCity: string): void {
    this.origin.big.text = originCode
    if (this.origin.small) this.origin.small.text = originCity
    this.dest.big.text = destCode
    if (this.dest.small) this.dest.small.text = destCity
    this.place(this.origin, originPos)
    this.place(this.dest, destPos)
    this.trailVisible = true
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
    this.place(this.stamp, worldPos)
    this.stampT = 0
  }

  // ---------- internals ----------
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
      t.layoutRect = Rect.create(-tw / 2, tw / 2, -h / 2, h / 2)
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
    const role = name.indexOf("RadarRangeLabel") === 0 ? "Label" : name === "EdgeArrowLabel" ? "Headline" : plate && name !== "CollectedStamp" ? "Headline" : "Title"
    const bigT = addTextRow(col.so, col.flex, "Code", big, role, w, rowHeight(role, distance), color, distance)
    let smallT: Text | null = null
    if (small !== null) smallT = addTextRow(col.so, col.flex, "Caption", small, "Label", w, rowHeight("Label", distance), new vec4(color.x, color.y, color.z, 0.8), distance)
    root.getTransform().setLocalScale(vec3.zero())
    return {root, big: bigT, small: smallT, visible: false, distance}
  }

  private place(l: Label, pos: vec3): void {
    l.visible = true
    l.root.getTransform().setWorldPosition(pos)
    l.root.getTransform().setLocalScale(vec3.one())
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
    for (const l of [this.origin, this.dest, this.stamp, this.reticle, this.hangarPadLabel, this.skyPadLabel, ...this.radarLabels]) {
      if (!l.visible) continue
      if (l === this.hangarPadLabel || l === this.skyPadLabel) continue
      const d = camPos.sub(l.root.getTransform().getWorldPosition())
      if (d.length > 0.01) l.root.getTransform().setWorldRotation(quat.lookAt(d.normalize(), vec3.up()))
    }
    // The arrow label is part of the head-locked edge cue: align with the view.
    if (this.arrow.visible) l2(this.arrow.root, camRot)
    if (this.stamp.visible) {
      this.stampT += getDeltaTime()
      const pop = this.stampT < 0.25 ? 0.6 + 1.8 * this.stampT : 1.05 - Math.min(0.05, (this.stampT - 0.25) * 0.2)
      this.stamp.root.getTransform().setLocalScale(new vec3(pop, pop, pop))
      if (this.stampT > this.stampSeconds) this.hideLabel(this.stamp)
    }
  }
}

function l2(root: SceneObject, camRot: quat): void {
  root.getTransform().setWorldRotation(camRot)
}

