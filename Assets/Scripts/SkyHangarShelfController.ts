// SkyHangarShelfController.ts
// Owns: the hangar collection (single source of truth: entries, sort mode, page) and the shelf's 3D
// content — one shelf ledge, `visibleSlots` floating slots with a soft glow underneath, and the small
// slowly-turning, gently bobbing models for the current page (no plaques: the name shows on hover / while held). A sideways pinch-drag on the shelf pages through the collection; pinching a model and
// holding it (about 0.3 s, without sideways movement) pulls it off the shelf to inspect (onInspect — the held
// controller takes over, hides the shelf copy via setEntryHidden and returns it to its slot). Opens ~1 m ahead,
// slightly below eye level, in the direction the user faces when it is opened.
// Plaque/controls text is NOT here — SkyHangarShelfUI renders what the main script pushes from
// getPageView(). Expects @inputs: camera object, sky controller (PartKit), content root.
// Emits onPageChanged. Must not: render text.

import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import {Interactor} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {SkyObjectInfo} from "./SkyHangarFlightData"
import {buildModel, BuiltModel, spinRotors, styleFor} from "./SkyHangarModelFactory"
import {SkyHangarSkyController} from "./SkyHangarSkyController"
import {makeObj, yawOf, yawOffset, yawRotation, DEG} from "./SkyHangarUtil"
import {HoverHold, isTap} from "./SkyHangarInput"

// The glass rail sits RAIL_Y above the stand origin: just under the vehicles and ~1.5 cm above the top of the fixed info labels
// (label centre is 1.5 cm below the origin, about 7.3 cm tall).
const RAIL_Y = 4.0
const STAND_FLOAT_CM = 7.7

export type ShelfSort = "newest" | "type"

/** Vehicle type groups in "Type" order, with their small header text. */
const TYPE_ORDER = ["plane", "helicopter", "satellite"]
const TYPE_HEADERS: {[k: string]: string} = {plane: "Planes", helicopter: "Helicopters", satellite: "Satellites"}

/** A request to pull a shelf model into the hand. */
export interface InspectRequest {
  info: SkyObjectInfo
  fromWorld: vec3
  interactor: Interactor
}

/** A quick tap on the shelf: on a model (info set) or on the shelf itself (info null). */
export interface ShelfTap {
  info: SkyObjectInfo | null
  fromWorld: vec3
}


export interface ShelfEntry {
  info: SkyObjectInfo
  where: string
  when: string
  /** Collection order (0 = first collected / pre-filled). */
  slot: number
}

interface Stand {
  obj: SceneObject
  holder: SceneObject
  model: BuiltModel | null
  entry: ShelfEntry | null
  glow: Material[]
  glowLevel: number
}

@component
export class SkyHangarShelfController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarShelfController – hangar collection + paged shelf</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("The main camera SceneObject")
  cameraObject!: SceneObject
  @input
  @hint("Sky controller — provides the shared primitive kit")
  sky!: SkyHangarSkyController
  @input
  @hint("Container the shelf content is built under (moves with the shelf root)")
  contentRoot!: SceneObject
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input("vec3", "{0, -12, -100}")
  @hint("Shelf centre relative to the eyes when opened (x right, y up, -z ahead), cm")
  openOffset: vec3 = new vec3(0, -12, -100)
  @input
  @hint("Models shown on the shelf at a time (one page)")
  @widget(new SliderWidget(3, 8, 1))
  visibleSlots: number = 3
  @input
  @hint("Horizontal spacing between stands, cm")
  @widget(new SliderWidget(8, 30, 0.5))
  standSpacingCm: number = 13
  @input
  @hint("Size of each model on its stand, cm")
  @widget(new SliderWidget(6, 25, 0.5))
  modelSpanCm: number = 10
  @input
  @hint("Sideways ray movement (degrees) that counts as a page swipe")
  @widget(new SliderWidget(1, 20, 0.5))
  swipeDeg: number = 3
  @input("vec4", "{0.75, 0.8, 0.9, 1.0}")
  @hint("Glass ledge tint (alpha is set by the style)")
  @widget(new ColorWidget())
  plankColor: vec4 = new vec4(0.75, 0.8, 0.9, 1.0)
  @input("vec4", "{0.86, 0.88, 0.92, 1.0}")
  @hint("Pedestal metal colour")
  @widget(new ColorWidget())
  standColor: vec4 = new vec4(0.9, 0.9, 0.95, 1.0)
  @ui.group_end

  private entries: ShelfEntry[] = []
  private stands: Stand[] = []
  private sort: ShelfSort = "newest"
  private page = 0
  private ready = false
  private built = false
  private drag: {it: Interactor; dir0: vec3; t0: number; stand: Stand | null; dist: number} | null = null
  private hiddenId = ""
  private hover = -1
  /** Raw slot under the ray (-1 = none); `hover` is this held for 0.3 s after the ray leaves so the glow does not flicker. */
  private rawHover = -1
  private hoverHold = new HoverHold<number>()
  private _onInspect = new Event<InspectRequest>()
  get onInspect(): PublicApi<InspectRequest> { return this._onInspect.publicApi() }
  private _onTap = new Event<ShelfTap>()
  get onTap(): PublicApi<ShelfTap> { return this._onTap.publicApi() }
  private _onPageChanged = new Event<void>()
  get onPageChanged(): PublicApi<void> { return this._onPageChanged.publicApi() }

  onAwake(): void {
    if (!this.cameraObject || !this.sky || !this.contentRoot) {
      print("SkyHangarShelfController: required @input not wired")
      return
    }
    this.createEvent("OnStartEvent").bind(() => (this.ready = true))
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  // ---------- public API ----------
  isReady(): boolean { return this.ready }
  getCount(): number { return this.entries.length }
  /** All entries in collection order. */
  getEntries(): ShelfEntry[] { return this.entries }
  getSort(): ShelfSort { return this.sort }
  getPage(): number { return this.page }
  getPageCount(): number { return Math.max(1, Math.ceil(this.entries.length / this.visibleSlots)) }
  /** "6–10 of 24" */
  getCounterText(): string {
    const n = this.entries.length
    if (n === 0) return "0 of 0"
    const a = this.page * this.visibleSlots + 1
    const b = Math.min(n, a + this.visibleSlots - 1)
    return a + "–" + b + " of " + n
  }
  /** Entries currently on the shelf, left to right. */
  getVisibleEntries(): ShelfEntry[] {
    const sorted = this.sortedEntries()
    return sorted.slice(this.page * this.visibleSlots, this.page * this.visibleSlots + this.visibleSlots)
  }
  /** Small group header for each visible stand: in Type order the first model of a group (and of a page) carries its type name; null elsewhere and in Recent order. */
  getVisibleGroupHeaders(): (string | null)[] {
    const vis = this.getVisibleEntries()
    return vis.map((e, i) => (this.sort === "type" && (i === 0 || vis[i - 1].info.kind !== e.info.kind) ? TYPE_HEADERS[e.info.kind] ?? null : null))
  }
  getVisibleIds(): string[] { return this.getVisibleEntries().map((e) => e.info.id) }

  nextPage(): boolean { return this.setPage(this.page + 1) }
  prevPage(): boolean { return this.setPage(this.page - 1) }
  setPage(p: number): boolean {
    const q = Math.max(0, Math.min(this.getPageCount() - 1, p))
    if (q === this.page) return false
    this.page = q
    this.render()
    return true
  }
  setSort(s: ShelfSort): void {
    if (s !== "newest" && s !== "type") return
    this.sort = s
    this.page = 0
    this.render()
  }
  toggleSort(): ShelfSort {
    this.setSort(this.sort === "newest" ? "type" : "newest")
    return this.sort
  }

  /** Visible-slot index of the model under the pinch ray / hand (-1 = none). */
  getHoverIndex(): number { return this.hover }
  /** World position of the model on visible slot i. */
  getStandModelWorldPos(i: number): vec3 {
    const st = this.stands[i]
    return st ? st.holder.getTransform().getWorldPosition() : this.sceneObject.getTransform().getWorldPosition()
  }

  /** Fixed world point on stand i (does not bob with the model): the tag anchor. */
  getStandAnchorWorldPos(i: number): vec3 {
    const st = this.stands[i]
    return st ? st.obj.getTransform().getWorldPosition() : this.sceneObject.getTransform().getWorldPosition()
  }

  /** Hide / show the shelf copy of an entry (while its model is out in the hand). */
  setEntryHidden(id: string, hidden: boolean): void {
    this.hiddenId = hidden ? id : ""
    for (const st of this.stands) if (st.model && st.entry && !isNull(st.model.root)) st.model.root.enabled = !(hidden && st.entry.info.id === id)
  }

  /** Jump to the page that holds the entry and return the world position of its slot (null if it is not in the collection). */
  revealEntry(id: string): vec3 | null {
    const idx = this.sortedEntries().findIndex((e) => e.info.id === id)
    if (idx < 0) return null
    const p = Math.floor(idx / this.visibleSlots)
    if (p !== this.page) this.setPage(p)
    for (const st of this.stands) if (st.entry && st.entry.info.id === id) return st.holder.getTransform().getWorldPosition()
    return null
  }

  /** World position of the shelf centre (for "released over the shelf"). */
  getShelfWorldPos(): vec3 { return this.sceneObject.getTransform().getWorldPosition() }

  /** Remove an entry from the collection (it went back to the sky). */
  removeEntry(id: string): void {
    const i = this.entries.findIndex((e) => e.info.id === id)
    if (i < 0) return
    this.entries.splice(i, 1)
    if (this.hiddenId === id) this.hiddenId = ""
    this.page = Math.max(0, Math.min(this.getPageCount() - 1, this.page))
    for (const st of this.stands) if (st.entry && st.entry.info.id === id) st.entry = null // force the stand to rebuild
    this.render()
  }

  /** The shelf model under a pinch ray (nearest along the ray), if any. */
  private standUnderRay(origin: vec3, dir: vec3): Stand | null {
    let best: Stand | null = null
    let bt = 1e9
    for (const st of this.stands) {
      if (!st.model || !st.entry || isNull(st.model.root)) continue
      const v = st.model.root.getTransform().getWorldPosition().sub(origin)
      const t = v.dot(dir)
      if (t <= 0) continue
      const off = v.sub(dir.uniformScale(t)).length
      if (off < this.modelSpanCm * 0.8 && t < bt) { bt = t; best = st }
    }
    return best
  }

  /** Place the shelf in front of the user (direction they face now). */
  openInFront(): void {
    const t = this.cameraObject.getTransform()
    const fwd = t.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    const yaw = yawOf(fwd)
    this.sceneObject.getTransform().setWorldPosition(yawOffset(t.getWorldPosition(), yaw, this.openOffset))
    this.sceneObject.getTransform().setWorldRotation(yawRotation(yaw))
  }

  /** Shelf-space position of the paging controls row (above the models, so the head-following menu bar never covers it). */
  controlsLocalPos(): vec3 { return new vec3(0, RAIL_Y + this.modelSpanCm * 1.6 + 8, 2) }
  /** Shelf-space position just above the models (for the title plaque). */
  titleLocalPos(): vec3 { return new vec3(0, RAIL_Y + this.modelSpanCm * 1.6 + 15.5, 0) }
  standLocalPos(i: number): vec3 {
    return new vec3((i - (this.visibleSlots - 1) / 2) * this.standSpacingCm, 0, 0)
  }

  /** Adds a model to the collection. Returns its collection index; jumps to the page that shows it. */
  add(info: SkyObjectInfo, where: string, when: string, showIt: boolean = true): number {
    const slot = this.entries.reduce((m, e) => Math.max(m, e.slot), -1) + 1
    const e: ShelfEntry = {info, where, when, slot}
    this.entries.push(e)
    if (showIt) {
      const idx = this.sortedEntries().indexOf(e)
      this.page = Math.floor(idx / this.visibleSlots)
    }
    this.render()
    return slot
  }

  // ---------- internals ----------
  private sortedEntries(): ShelfEntry[] {
    const list = this.entries.slice()
    if (this.sort === "newest") list.sort((a, b) => b.slot - a.slot)
    else list.sort((a, b) => TYPE_ORDER.indexOf(a.info.kind) - TYPE_ORDER.indexOf(b.info.kind) || b.slot - a.slot)
    return list
  }

  private build(): void {
    const kit = this.sky.partKit
    if (!kit) return
    const w = this.visibleSlots * this.standSpacingCm + 4
    // Thin glass ledge with a soft edge glow (translucent; reads on an additive display)
    kit.part(this.contentRoot, "ShelfLedge", kit.box, kit.uniqueUnlit(new vec4(this.plankColor.x, this.plankColor.y, this.plankColor.z, 0.28)), new vec3(0, RAIL_Y, 0), new vec3(w, 0.8, 12))
    kit.part(this.contentRoot, "ShelfEdge", kit.box, kit.uniqueUnlit(new vec4(0.62, 0.85, 1.0, 0.95)), new vec3(0, RAIL_Y, 6.05), new vec3(w, 0.35, 0.25))
    kit.part(this.contentRoot, "ShelfEdgeGlow", kit.box, kit.uniqueUnlit(new vec4(0.55, 0.8, 1.0, 0.22)), new vec3(0, RAIL_Y, 6.2), new vec3(w + 0.6, 1.6, 0.1))
    kit.part(this.contentRoot, "ShelfBackEdge", kit.box, kit.uniqueUnlit(new vec4(0.85, 0.92, 1.0, 0.5)), new vec3(0, RAIL_Y, -6.0), new vec3(w, 0.2, 0.15))
    for (let i = 0; i < this.visibleSlots; i++) {
      const obj = makeObj(this.contentRoot, "ShelfStand_" + i)
      obj.getTransform().setLocalPosition(this.standLocalPos(i))
      // No pedestal: a soft glow pool on the ledge under the floating model.
      const glow = [
        kit.uniqueUnlit(new vec4(0.5, 0.78, 1.0, 0.1)),
        kit.uniqueUnlit(new vec4(0.6, 0.85, 1.0, 0.16)),
        kit.uniqueUnlit(new vec4(0.85, 0.95, 1.0, 0.3))
      ]
      kit.part(obj, "GlowOuter", kit.cylinder, glow[0], new vec3(0, RAIL_Y + 0.5, 0), new vec3(this.modelSpanCm * 1.15, 0.05, this.modelSpanCm * 1.15))
      kit.part(obj, "GlowMid", kit.cylinder, glow[1], new vec3(0, RAIL_Y + 0.55, 0), new vec3(this.modelSpanCm * 0.85, 0.05, this.modelSpanCm * 0.85))
      kit.part(obj, "GlowCore", kit.cylinder, glow[2], new vec3(0, RAIL_Y + 0.6, 0), new vec3(this.modelSpanCm * 0.45, 0.05, this.modelSpanCm * 0.45))
      const holder = makeObj(obj, "ModelHolder")
      holder.getTransform().setLocalPosition(new vec3(0, STAND_FLOAT_CM + this.modelSpanCm * 0.25, 0))
      // Tip the model toward the viewer so its top view reads from eye level.
      holder.getTransform().setLocalRotation(quat.angleAxis(0.45, vec3.right()))
      this.stands.push({obj, holder, model: null, entry: null, glow, glowLevel: 0})
    }
    // Drag zone over the models: a sideways pinch-drag pages the shelf.
    const zone = makeObj(this.contentRoot, "ShelfDragZone")
    zone.getTransform().setLocalPosition(new vec3(0, RAIL_Y + this.modelSpanCm * 0.8, 0))
    const col = zone.createComponent("Physics.ColliderComponent") as ColliderComponent
    const box = Shape.createBoxShape()
    box.size = new vec3(w, this.modelSpanCm * 1.6 + 3, 10)
    col.shape = box
    col.fitVisual = false
    const it = zone.createComponent(Interactable.getTypeName()) as Interactable
    const hoverAt = (e: InteractorEvent) => {
      const d = e.interactor.direction
      const o = e.interactor.startPoint
      const st = d && o ? this.standUnderRay(o, d.normalize()) : null
      this.rawHover = st ? this.stands.indexOf(st) : -1
    }
    it.onHoverEnter.add(hoverAt)
    it.onHoverUpdate.add(hoverAt)
    it.onHoverExit.add(() => (this.rawHover = -1))
    it.onTriggerStart.add((e: InteractorEvent) => {
      hoverAt(e)
      const d = e.interactor.direction
      const o = e.interactor.startPoint
      if (d) {
        const stand = o ? this.standUnderRay(o, d.normalize()) : null
        const dist = stand && o && stand.model ? stand.model.root.getTransform().getWorldPosition().sub(o).length : this.openOffset.length
        this.drag = {it: e.interactor, dir0: d, t0: getTime(), stand, dist}
      }
    })
    this.built = true
  }

  private render(): void {
    if (!this.built) this.build()
    if (!this.built) return
    const kit = this.sky.partKit
    const vis = this.getVisibleEntries()
    for (let i = 0; i < this.stands.length; i++) {
      const s = this.stands[i]
      const e = vis[i] ?? null
      if (s.entry === e && s.model) continue
      if (s.model && !isNull(s.model.root)) s.model.root.destroy()
      s.model = null
      s.entry = e
      s.obj.enabled = !!e
      if (e) {
        s.model = buildModel(kit, s.holder, "ShelfModel_" + e.info.id, e.info.kind, this.modelSpanCm, styleFor(e.info.colors, e.info.kind, true, e.info.airlineIcao), e.info.aircraftType)
        s.model.root.getTransform().setLocalRotation(quat.angleAxis(0.6 + i * 0.4, vec3.up()))
        s.model.root.enabled = e.info.id !== this.hiddenId
      }
    }
    this._onPageChanged.invoke()
  }

  private update(): void {
    this.hover = this.hoverHold.update(this.rawHover >= 0 ? this.rawHover : null, getTime()) ?? -1
    if (this.drag && this.drag.stand && this.drag.it.isTriggering && getTime() - this.drag.t0 >= 0.3) {
      // Held still on a model: pull it into the hand (sideways movement would have been a page swipe instead).
      const it = this.drag.it
      const d = it.direction
      const st = this.drag.stand
      let sideways = 0
      if (d) {
        const right = this.sceneObject.getTransform().getWorldRotation().multiplyVec3(vec3.right())
        sideways = Math.abs(Math.asin(Math.max(-1, Math.min(1, d.normalize().sub(this.drag.dir0.normalize()).dot(right)))) / DEG)
      }
      this.drag = null
      if (sideways < this.swipeDeg && st.entry && st.model && !isNull(st.model.root)) {
        this._onInspect.invoke({info: st.entry.info, fromWorld: st.model.root.getTransform().getWorldPosition(), interactor: it})
      }
    }
    if (this.drag) {
      const it = this.drag.it
      if (!it.isTriggering) {
        const d = it.direction
        const drag = this.drag
        this.drag = null
        const moveCm = d ? d.normalize().sub(drag.dir0.normalize()).length * drag.dist : 0
        if (isTap(getTime() - drag.t0, moveCm)) {
          const st = drag.stand
          const shown = !!st && !!st.entry && !!st.model && !isNull(st.model.root)
          this._onTap.invoke({info: shown ? st!.entry!.info : null, fromWorld: shown ? st!.model!.root.getTransform().getWorldPosition() : this.getShelfWorldPos()})
        } else if (d) {
          const right = this.sceneObject.getTransform().getWorldRotation().multiplyVec3(vec3.right())
          const delta = (Math.asin(Math.max(-1, Math.min(1, d.normalize().sub(drag.dir0.normalize()).dot(right)))) / DEG)
          // Drag left (content moves left) -> next page; drag right -> previous page.
          if (delta < -this.swipeDeg) this.nextPage()
          else if (delta > this.swipeDeg) this.prevPage()
        }
        this.drag = null
      }
    }
    if (this.sceneObject.getTransform().getLocalScale().x < 0.01) return
    const dt = getDeltaTime()
    const now = getTime()
    for (let i = 0; i < this.stands.length; i++) {
      const s = this.stands[i]
      const lit = i === this.hover || (!!s.entry && s.entry.info.id === this.hiddenId) ? 1 : 0
      s.glowLevel += (lit - s.glowLevel) * Math.min(1, dt * 8)
      const pulse = 0.85 + 0.15 * Math.sin(now * 1.3 + i)
      const base = [0.1, 0.16, 0.3]
      for (let g = 0; g < s.glow.length; g++) s.glow[g].mainPass.baseColor = new vec4(0.55 + 0.3 * g * 0.5, 0.8 + 0.1 * g * 0.5, 1, Math.min(1, base[g] * pulse * (1 + 1.2 * s.glowLevel)))
      // Slow bob: the floating model drifts a few mm up and down, each slot out of phase.
      s.holder.getTransform().setLocalPosition(new vec3(0, STAND_FLOAT_CM + this.modelSpanCm * 0.25 + Math.sin(now * 1.1 + i * 1.7) * 0.7 + s.glowLevel * 0.8, 0))
      if (!s.model) continue
      const t = s.model.root.getTransform()
      t.setLocalRotation(t.getLocalRotation().multiply(quat.angleAxis(dt * 0.35, vec3.up())))
      spinRotors(s.model, dt, 0.8)
    }
  }
}
