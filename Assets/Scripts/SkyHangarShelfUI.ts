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
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {
  GLASS_READABLE, PALETTE, applyFontToContent, RADIUS, SPACE, addFlexChild, enlargeHitArea, addTextRow, glassPanel, makeFlex, obj, roleSize, rowHeight, FlexDirection, FlexJustify, FlexAlign
} from "./SkyHangarSharedUI"

interface Tag {
  root: SceneObject
  texts: Text[]
  shown: number
}

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
    glassPanel(root, "ShelfTitleGlass", new vec2(w, h), {radiusCm: h / 2, tint: GLASS_READABLE})
    const content = obj(root, "Content", new vec3(0, 0, 0.6))
    const col = makeFlex(content, "Column", FlexDirection.Column, w, h, {justify: FlexJustify.Center, align: FlexAlign.Center})
    this.title = addTextRow(col.so, col.flex, "TitleText", "My Hangar · 12 models", "Headline", w - 2, rowHeight("Headline", D), PALETTE.text, D)
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
    if (this.title) this.title.text = text
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
    glassPanel(root, "NameTagGlass", new vec2(W, h), {radiusCm: RADIUS.m * k, tint: new vec4(0.04, 0.09, 0.22, 0.92), glow: new vec4(0.6, 0.78, 1, 0.06)})
    const content = obj(root, "Content", new vec3(0, 0, 0.6))
    const col = makeFlex(content, "Column", FlexDirection.Column, W, h, {justify: FlexJustify.Center, align: FlexAlign.Center})
    const inner = W - 1.0
    const white = new vec4(1, 1, 1, 1)
    const t1 = addTextRow(col.so, col.flex, "TagHead", "VS93", "Headline", inner, rowHeight("Headline", D), white, D)
    const t2 = addTextRow(col.so, col.flex, "TagRoute", "LHR → CUN", "Body", inner, rowHeight("Body", D), white, D)
    const t3 = addTextRow(col.so, col.flex, "TagAirline", "VIRGIN ATLANTIC AIRWAYS", "Label", inner, rowHeight("Label", D), white, D)
    ;(t2 as Text & {weight?: number}).weight = 600 // the Body role is lighter than the rest; match the other lines
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
    glassPanel(root, "GroupHeaderGlass", new vec2(w, h), {radiusCm: h / 2, tint: GLASS_READABLE})
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
    glassPanel(root, "PagingGlass", new vec2(w, h + SPACE.s * k * 2), {radiusCm: (h + SPACE.s * k * 2) / 2, tint: GLASS_READABLE})
    const content = obj(root, "Content", new vec3(0, 0, 0.6))
    const row = makeFlex(content, "Row", FlexDirection.Row, w, h + SPACE.s * k * 2, {gap: SPACE.m * k, justify: FlexJustify.Center, align: FlexAlign.Center})
    this.makeButton(row.so, row.flex, "ShelfPrevButton", "‹", h, h, () => this._onPrev.invoke(), "Round")
    this.dots = addTextRow(row.so, row.flex, "PageDots", "● ○ ○", "Body", 8 * k, h, PALETTE.accent, D)
    this.counter = addTextRow(row.so, row.flex, "PageCounter", "6–10 of 24", "Body", 11 * k, h, PALETTE.text, D)
    this.makeButton(row.so, row.flex, "ShelfNextButton", "›", h, h, () => this._onNext.invoke(), "Round")
    this.sortContent = this.makeButton(row.so, row.flex, "ShelfSortButton", "Sort: Recent", 13 * k, h, () => this._onSortToggle.invoke(), "Capsule")
  }

  private makeButton(parent: SceneObject, flex: FlexLayout, name: string, label: string, w: number, h: number, onTap: () => void, shape: string): ElementContent {
    const so = obj(parent, name, new vec3(0, 0, 0.02))
    const btn = so.createComponent(Button.getTypeName()) as Button
    btn.setVariant({theme: "SnapOS2", shape: shape, style: "PrimaryNeutral"})
    btn.size = new vec3(w, h, 1)
    const ec = so.createComponent(ElementContent.getTypeName()) as ElementContent
    applyFontToContent(ec)
    ec.text = label
    ec.textSize = roleSize(label.length <= 1 ? "Headline" : "Button", this.readDistanceCm)
    btn.onTriggerUp.add(() => onTap())
    enlargeHitArea(btn)
    addFlexChild(so, flex, w, h)
    return ec
  }
}

