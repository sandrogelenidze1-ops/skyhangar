// SkyHangarShelfUI.ts
// Owns: the hangar shelf's text and controls in the glass style — a title plaque ("My Hangar · N models"),
// one glass info tag under each model, always visible (flight large, route in accent,
// airline + where/when as small caps), and a glass paging row (UIKit Buttons ‹ and ›, page dots, "6–10 of 24" counter, Sort toggle).
// Lives as a child of the shelf root so everything moves with the shelf.
// Public API: configure(...), setPlaque(i, lines|null) (stores the text), showTag(i, worldPos|null), setControls(...), setTitle(text, pos?),
// getPlaqueText(i), getPlaqueCount(), getCounterText(), getDotsText(), getSortLabel().
// Emits: onPrev, onNext, onSortToggle. Passive view — the main script tells it what to show.

import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {ElementContent} from "SpectaclesUIKit.lspkg/Scripts/Components/Content/ElementContent"
import {RoundedRectangle, RoundedRectBlendMode} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {
  GLASS, glassSurface, fontFor, FONT_METRICS, emCm, opticalLiftCm, chevronLiftCm, liftContent, textWidthEm, PALETTE, applyFontToContent, applyFontToContentWeight, applyTextRole, RADIUS, SPACE, addFlexChild, enlargeHitArea, addTextRow, glassPanel, makeFlex, obj, roleSize, rowHeight, FlexDirection, FlexJustify, FlexAlign
} from "./SkyHangarSharedUI"

interface Tag {
  root: SceneObject
  texts: Text[]
  shown: number
}

const PAGE_DOT = new vec4(0x2f / 255, 0x80 / 255, 1, 1) // #2F80FF neon blue, opaque
const PAGE_DOT_ACTIVE = new vec4(0x4d / 255, 0xa3 / 255, 1, 1) // #4DA3FF brighter, for the current page
const PAGE_DOT_RIM = new vec4(1, 1, 1, 1) // thin white rim on every dot

@component
export class SkyHangarShelfUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarShelfUI – glass plaques + paging controls</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Plaque width, cm")
  @widget(new SliderWidget(8, 24, 0.5))
  plaqueWidth: number = 12.4
  @input
  @hint("Reading distance used to size plaque text, cm")
  @widget(new SliderWidget(50, 200, 5))
  readDistanceCm: number = 100
  @input("vec3", "{0, 22, 0}")
  @hint("Initial title plaque position in shelf space, cm (moved by the main script)")
  titleOffset: vec3 = new vec3(0, 22, 0)
  @ui.group_end

  private names: (string[] | null)[] = []
  private tags: Tag[] = []
  private title!: Text
  private titleRoot!: SceneObject
  private counter!: Text
  private dots!: Text
  private titleContent!: SceneObject
  private titleL!: Text
  private titleR!: Text
  private titleDot!: RoundedRectangle
  private pageDots: RoundedRectangle[] = []
  private sortContent!: ElementContent
  private sortLabel = "Recent"
  private headers: {root: SceneObject; text: Text; shown: string}[] = []
  private configured = false
  private _onPrev = new Event<void>()
  private _onNext = new Event<void>()
  private _onSortToggle = new Event<void>()
  get onPrev(): PublicApi<void> { return this._onPrev.publicApi() }
  get onNext(): PublicApi<void> { return this._onNext.publicApi() }
  get onSortToggle(): PublicApi<void> { return this._onSortToggle.publicApi() }

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas")
    const D = this.readDistanceCm
    const k = D / 110
    const root = obj(this.sceneObject, "ShelfTitle", this.titleOffset)
    this.titleRoot = root
    const w = 34 * k
    const h = rowHeight("Headline", D) + SPACE.m * k * 2
    glassSurface(root, "ShelfTitleGlass", new vec2(w, h), {radiusCm: h / 2})
    const content = obj(root, "Content", new vec3(0, 0, 0.6))
    const col = makeFlex(content, "Column", FlexDirection.Column, w, h, {justify: FlexJustify.Center, align: FlexAlign.Center})
    this.title = addTextRow(col.so, col.flex, "TitleText", "My Hangar · 12 models", "Headline", w - 2, rowHeight("Headline", D), PALETTE.text, D)
    // The visible title is drawn from three parts (left text, a round dot, right text) so the separator is a true circle
    // centred on the x-height with equal gaps; this.title keeps the plain string (invisible) for the API.
    this.title.textFill.color = new vec4(1, 1, 1, 0)
    this.titleContent = content
    const mk = (name: string, align: HorizontalAlignment): Text => {
      const so = obj(content, name, new vec3(0, 0, 0))
      const t = so.createComponent("Component.Text") as Text
      applyTextRole(t, "Headline", D)
      t.depthTest = true
      t.textFill.color = PALETTE.text
      t.horizontalAlignment = align
      t.verticalAlignment = VerticalAlignment.Center
      t.horizontalOverflow = HorizontalOverflow.Overflow
      t.verticalOverflow = VerticalOverflow.Overflow
      return t
    }
    this.titleL = mk("TitleLeft", HorizontalAlignment.Right)
    this.titleR = mk("TitleRight", HorizontalAlignment.Left)
    const dot = obj(content, "TitleDot", new vec3(0, 0, 0))
    this.titleDot = dot.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
    this.titleDot.initialize()
    this.titleDot.blendMode = RoundedRectBlendMode.Normal
    this.titleDot.backgroundColor = PALETTE.text
    this.layoutTitle("My Hangar · 12 models", w)
  }

  /** Places "left · right" around a round dot: equal gaps, dot centred on the x-height, whole run centred on the pill. */
  private layoutTitle(text: string, wCm: number): void {
    const cut = text.indexOf(" · ")
    const left = cut >= 0 ? text.substring(0, cut) : text
    const right = cut >= 0 ? text.substring(cut + 3) : ""
    const size = this.titleL.size
    const em = emCm(size)
    const g = 0.3 * em
    const d = 0.26 * em // about 2.2x the old middle dot
    const wA = textWidthEm(left) * em
    const wB = textWidthEm(right) * em
    const total = cut >= 0 ? wA + g * 2 + d + wB : wA
    const dotX = cut >= 0 ? -total / 2 + wA + g + d / 2 : 0
    const hh = rowHeight("Headline", this.readDistanceCm)
    const set = (t: Text, s: string, x0: number, x1: number): void => {
      t.text = s
      const lift = opticalLiftCm(text, size)
      t.layoutRect = Rect.create(x0, x1, -hh / 2 + lift, hh / 2 + lift)
    }
    if (cut >= 0) {
      set(this.titleL, left, dotX - d / 2 - g - wCm, dotX - d / 2 - g)
      set(this.titleR, right, dotX + d / 2 + g, dotX + d / 2 + g + wCm)
    } else {
      set(this.titleL, left, -wCm / 2, wCm / 2)
      this.titleL.horizontalAlignment = HorizontalAlignment.Center
      this.titleR.text = ""
    }
    const xCentreBelow = ((FONT_METRICS.cap + FONT_METRICS.xHeight) / 4 - FONT_METRICS.xHeight / 2) * em // x-height centre sits below the optical centre
    this.titleDot.size = new vec2(d, d)
    this.titleDot.cornerRadius = d / 2
    this.titleDot.getSceneObject().getTransform().setLocalPosition(new vec3(dotX, -xCentreBelow, 0))
    this.titleDot.getSceneObject().getTransform().setLocalScale(cut >= 0 ? vec3.one() : vec3.zero())
  }

  // ---------- public API ----------
  getPlaqueCount(): number { return this.names.filter((n) => !!n).length }
  /** Name text of visible stand i (left to right): "head | route | where · when", "" if empty. */
  getPlaqueText(i: number): string {
    const n = this.names[i]
    return n ? n.join(" | ") : ""
  }
  /** Stand index the name tag is showing for (-1 = hidden). */
  getTagIndex(): number { const t = this.tags.find((x) => x.shown >= 0); return t ? t.shown : -1 }
  getPlaqueSlotCount(): number { return this.tags.length }
  getTagCount(): number { return this.tags.filter((x) => x.shown >= 0).length }
  getTitle(): string { return this.title ? this.title.text : "" }
  getCounterText(): string { return this.counter ? this.counter.text : "" }
  getDotsText(): string { return this.dots ? this.dots.text : "" }
  getSortLabel(): string { return this.sortLabel }
  /** Text of the group header above stand i ("" = none). */
  getHeaderText(i: number): string { return this.headers[i] && this.headers[i].shown ? this.headers[i].shown : "" }
  getHeaderCount(): number { return this.headers.filter((h) => !!h.shown).length }

  /** Small type header above stand i at worldPos; null text or position hides it. */
  showHeader(i: number, text: string | null, worldPos: vec3 | null): void {
    const h = this.headers[i]
    if (!h) return
    if (!text || !worldPos) {
      if (h.shown) {
        h.shown = ""
        h.root.getTransform().setLocalScale(vec3.zero())
      }
      return
    }
    if (h.shown !== text) {
      h.shown = text
      h.text.text = text
      h.root.getTransform().setLocalScale(vec3.one())
    }
    h.root.getTransform().setWorldPosition(worldPos)
  }

  setTitle(text: string, localPos?: vec3): void {
    if (this.title) {
      this.title.text = text
      this.layoutTitle(text, 34 * (this.readDistanceCm / 110))
    }
    if (this.titleRoot && localPos) this.titleRoot.getTransform().setLocalPosition(localPos)
  }

  /** Builds the name tag and the paging row once. */
  configure(slotCount: number, controlsPos: vec3): void {
    if (this.configured) return
    this.configured = true
    for (let i = 0; i < slotCount; i++) this.names.push(null)
    for (let i = 0; i < slotCount; i++) this.tags.push(this.buildTag())
    for (let i = 0; i < slotCount; i++) this.headers.push(this.buildHeader())
    this.buildControls(controlsPos)
  }

  /** lines: [airline · flight, route, where · when]; null = no model on that stand. Text only — see showTag. */
  setPlaque(i: number, lines: string[] | null): void {
    if (i < 0 || i >= this.names.length) return
    this.names[i] = lines ? lines.slice() : null
    if (this.tags[i] && this.tags[i].shown === i) this.showTag(i, null)
  }

  /** Shows stand i's info tag at worldPos; null hides it; i < 0 hides every tag. */
  showTag(i: number, worldPos: vec3 | null): void {
    if (i < 0) {
      for (let j = 0; j < this.tags.length; j++) this.showTag(j, null)
      return
    }
    const t = this.tags[i]
    if (!t) return
    const lines = this.names[i]
    if (!lines || !worldPos) {
      if (t.shown !== -1) {
        t.shown = -1
        t.root.getTransform().setLocalScale(vec3.zero())
      }
      return
    }
    if (t.shown !== i) {
      t.shown = i
      const head = lines[0] ?? ""
      const cut = head.lastIndexOf(" · ")
      const airline = cut >= 0 ? head.substring(0, cut) : head
      const flight = cut >= 0 ? head.substring(cut + 3) : ""
      t.texts[0].text = flight || airline
      t.texts[1].text = lines[1] ?? ""
      t.texts[2].text = (flight ? airline : "").toUpperCase()
      t.texts[3].text = lines[2] ?? ""
      t.root.getTransform().setLocalScale(vec3.one())
    }
    t.root.getTransform().setWorldPosition(worldPos)
  }

  setControls(counterText: string, page: number, pageCount: number, sortLabel: string): void {
    if (this.counter) this.counter.text = counterText
    if (this.dots) {
      let s = ""
      for (let i = 0; i < pageCount; i++) s += (i === page ? "●" : "○") + (i < pageCount - 1 ? " " : "")
      this.dots.text = s
      this.layoutPageDots(page, pageCount)
    }
    this.sortLabel = sortLabel
    if (this.sortContent) this.sortContent.text = "Sort: " + sortLabel
  }

  // ---------- internals ----------
  private buildTag(): Tag {
    const D = this.readDistanceCm
    const k = D / 110
    const W = this.plaqueWidth
    const root = obj(this.sceneObject, "NameTag", vec3.zero())
    root.getTransform().setLocalRotation(quat.angleAxis(-0.2, vec3.right()))
    const h = rowHeight("Headline", D) + rowHeight("Body", D) + rowHeight("Label", D) * 2 + SPACE.m * k
    glassSurface(root, "NameTagGlass", new vec2(W, h), {radiusCm: 0.2 * Math.min(W, h)})
    const content = obj(root, "Content", new vec3(0, 0, 0.6))
    const col = makeFlex(content, "Column", FlexDirection.Column, W, h, {justify: FlexJustify.Center, align: FlexAlign.Center})
    const inner = W - 1.0
    const white = new vec4(1, 1, 1, 1)
    const t1 = addTextRow(col.so, col.flex, "TagHead", "VS93", "Headline", inner, rowHeight("Headline", D), white, D)
    const t2 = addTextRow(col.so, col.flex, "TagRoute", "LHR → CUN", "Body", inner, rowHeight("Body", D), white, D)
    const t3 = addTextRow(col.so, col.flex, "TagAirline", "VIRGIN ATLANTIC AIRWAYS", "Label", inner, rowHeight("Label", D), white, D)
    t2.font = fontFor(600) // the Body role is lighter than the rest; match the other lines
    const t4 = addTextRow(col.so, col.flex, "TagMeta", "Ealing, London · 28 Oct 17:54", "Label", inner, rowHeight("Label", D), white, D)
    root.getTransform().setLocalScale(vec3.zero())
    return {root, texts: [t1, t2, t3, t4], shown: -1}
  }

  /** Small glass pill with the group name (Type sort). */
  private buildHeader(): {root: SceneObject; text: Text; shown: string} {
    const D = this.readDistanceCm
    const k = D / 110
    const root = obj(this.sceneObject, "GroupHeader", vec3.zero())
    const h = rowHeight("Label", D) + SPACE.s * k
    const w = 9 * k
    glassSurface(root, "GroupHeaderGlass", new vec2(w, h), {radiusCm: h / 2})
    const content = obj(root, "Content", new vec3(0, 0, 0.6))
    const col = makeFlex(content, "Column", FlexDirection.Column, w, h, {justify: FlexJustify.Center, align: FlexAlign.Center})
    const text = addTextRow(col.so, col.flex, "GroupHeaderText", "Planes", "Label", w - 1, rowHeight("Label", D), PALETTE.text, D)
    root.getTransform().setLocalScale(vec3.zero())
    return {root, text, shown: ""}
  }

  private buildControls(pos: vec3): void {
    const D = this.readDistanceCm
    const k = D / 110
    const root = obj(this.sceneObject, "ShelfPagingControls", pos)
    const h = 3.6 * k
    const w = 50 * k
    glassSurface(root, "PagingGlass", new vec2(w, h + SPACE.s * k * 2), {radiusCm: (h + SPACE.s * k * 2) / 2})
    const content = obj(root, "Content", new vec3(0, 0, 0.6))
    const row = makeFlex(content, "Row", FlexDirection.Row, w, h + SPACE.s * k * 2, {gap: SPACE.m * k, justify: FlexJustify.Center, align: FlexAlign.Center})
    this.makeButton(row.so, row.flex, "ShelfPrevButton", "‹", h, h, () => this._onPrev.invoke(), "Round")
    this.dots = addTextRow(row.so, row.flex, "PageDots", "● ○ ○", "Body", 8 * k, h, PALETTE.accent, D)
    this.dots.textFill.color = new vec4(1, 1, 1, 0) // text keeps the API/layout slot; the dots are drawn as round shapes
    this.counter = addTextRow(row.so, row.flex, "PageCounter", "6–10 of 24", "Body", 11 * k, h, PALETTE.text, D)
    this.makeButton(row.so, row.flex, "ShelfNextButton", "›", h, h, () => this._onNext.invoke(), "Round")
    this.sortContent = this.makeButton(row.so, row.flex, "ShelfSortButton", "Sort: Recent", 13 * k, h, () => this._onSortToggle.invoke(), "Capsule")
  }

  /** Page dots as round shapes centred in their slot (filled = current page, ring = other pages). */
  private layoutPageDots(page: number, pageCount: number): void {
    const slot = this.dots.getSceneObject()
    const dia = 0.45 * emCm(this.dots.size)
    const pitch = dia * 2
    while (this.pageDots.length < pageCount) {
      const so = obj(slot, "PageDot_" + this.pageDots.length, new vec3(0, 0, 0))
      const r = so.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
      r.initialize()
      r.blendMode = RoundedRectBlendMode.Normal
      this.pageDots.push(r)
    }
    for (let i = 0; i < this.pageDots.length; i++) {
      const r = this.pageDots[i]
      const t = r.getSceneObject().getTransform()
      if (i >= pageCount) { t.setLocalScale(vec3.zero()); continue }
      t.setLocalScale(vec3.one())
      t.setLocalPosition(new vec3((i - (pageCount - 1) / 2) * pitch, 0, 0))
      const on = i === page
      const d = on ? dia * 1.3 : dia // the current page's dot is a little bigger
      r.size = new vec2(d, d)
      r.cornerRadius = d / 2
      // Neon blue, fully opaque, the same at every time of day: #2F80FF for the other pages, brighter #4DA3FF for the current one. Blue on the blue sky / glass is only
      // about 1.1-1.2:1 by luminance, so every dot also carries a thin white rim (white vs #2F80FF is about 3.9:1) to stay clearly visible day, dusk and night.
      r.backgroundColor = on ? PAGE_DOT_ACTIVE : PAGE_DOT
      r.border = true
      r.borderSize = 0.09
      r.borderColor = PAGE_DOT_RIM
    }
  }

  private makeButton(parent: SceneObject, flex: FlexLayout, name: string, label: string, w: number, h: number, onTap: () => void, shape: string): ElementContent {
    const holder = obj(parent, name + "Holder", new vec3(0, 0, 0.02))
    const so = obj(holder, name, new vec3(0, 0, 0.4))
    const btn = so.createComponent(Button.getTypeName()) as Button
    btn.setVariant({theme: "SnapOS2", shape: shape, style: "Ghost"}) // transparent fill: the frosted disc below carries the look
    btn.size = new vec3(w, h, 1)
    const glass = glassSurface(holder, name + "Glass", new vec2(w, h), {radiusCm: h, fill: 1.5, rim: 1, rimCm: 0.14, glow: false}) // brighter than the pill: white ~32%, rim ~2 px
    glass.so.getTransform().setLocalPosition(new vec3(0, 0, 0.8))
    btn.onHoverEnter.add(() => glass.setHover(true))
    btn.onHoverExit.add(() => glass.setHover(false))
    const ec = so.createComponent(ElementContent.getTypeName()) as ElementContent
    applyFontToContent(ec)
    const ecAny = ec as any
    ecAny._useThemeColors = false
    const white = new vec4(1, 1, 1, 1)
    ecAny._defaultTextColor = white
    ecAny._hoveredTextColor = white
    ecAny._triggeredTextColor = white
    ec.text = label
    const chevron = label.length <= 1
    ec.textSize = roleSize(chevron ? "Headline" : "Button", this.readDistanceCm) * (chevron ? 1.6 : 1) // chevrons 60% bigger, SemiBold for a thicker stroke
    if (chevron) applyFontToContentWeight(ec, 600)
    liftContent(ec, chevron ? chevronLiftCm(ec.textSize) : opticalLiftCm(label, ec.textSize))
    btn.onTriggerUp.add(() => onTap())
    enlargeHitArea(btn)
    addFlexChild(holder, flex, w, h)
    return ec
  }
}

