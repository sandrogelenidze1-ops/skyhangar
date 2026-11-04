// SkyHangarMain.ts
// Owns: orchestration only — wires the sky, held toy, hangar shelf, radar, edge arrows, menu bar,
// info card, world labels and audio together, and holds the session state (mode, card target,
// collected count). Exposes simple public getters + test hooks for LEAF / automation.
// Expects @inputs: every authored SkyHangar controller and UI module (wired by the scene bootstrap).
// Must not: render text or build UIKit (that lives in the *UI.ts modules).

import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
import {Interactor, InteractorInputType} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"
import {SkyObjectInfo, SNAPSHOT_UTC} from "./SkyHangarFlightData"
import {buildModel, styleFor, fleetExamples, familyForInfo} from "./SkyHangarModelFactory"
import {SkyHangarSkyController, PullRequest} from "./SkyHangarSkyController"
import {SkyHangarHeldController, InspectHooks} from "./SkyHangarHeldController"
import {SkyHangarShelfController, ShelfEntry, InspectRequest, ShelfTap} from "./SkyHangarShelfController"
import {SkyHangarRadarController} from "./SkyHangarRadarController"
import {UI_RENDER_ORDER, setRenderOrderTree} from "./SkyHangarSharedUI"
import {SkyHangarEdgeArrows} from "./SkyHangarEdgeArrows"
import {SkyHangarAudioController} from "./SkyHangarAudioController"
import {SkyHangarMenuBarUI} from "./SkyHangarMenuBarUI"
import {SkyHangarInfoCardUI, CardContent} from "./SkyHangarInfoCardUI"
import {buildTrack} from "./SkyHangarRouteMap"
import {heliTrack} from "./SkyHangarRouteGeo"
import {SkyHangarLabelsUI} from "./SkyHangarLabelsUI"
import {SkyHangarShelfUI} from "./SkyHangarShelfUI"
import {DEG, makeObj} from "./SkyHangarUtil"

export type SkyMode = "sky" | "radar" | "hangar"

/** "2:23" from minutes. */
function hm(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const r = m % 60
  return h + ":" + (r < 10 ? "0" : "") + r
}

@component
export class SkyHangarMain extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarMain – orchestrator</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("The main camera SceneObject (the user's head)")
  cameraObject!: SceneObject
  @input
  @hint("StandIn_VirtualSky controller")
  sky!: SkyHangarSkyController
  @input
  @hint("Held-toy controller (pull, pads, collect, sky return, throw)")
  held!: SkyHangarHeldController
  @input
  @hint("Hangar shelf controller (collection, paging, stands + models)")
  shelf!: SkyHangarShelfController
  @input
  @hint("Hangar shelf plaques + paging UI")
  shelfUI!: SkyHangarShelfUI
  @input
  @hint("Radar controller")
  radar!: SkyHangarRadarController
  @input
  @hint("Edge arrows controller")
  arrows!: SkyHangarEdgeArrows
  @input
  @hint("Menu bar UI")
  menuBar!: SkyHangarMenuBarUI
  @input
  @hint("Info card UI")
  infoCard!: SkyHangarInfoCardUI
  @input
  @hint("World labels UI (trail codes, reticle label, pad labels, arrow label, Collected stamp)")
  labels!: SkyHangarLabelsUI
  @input
  @hint("Audio cues")
  audio!: SkyHangarAudioController
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Place name written on plaques as 'where collected' (hard-coded to match the snapshot location)")
  collectedPlace: string = "Ealing, London"
  @input
  @hint("Sky object ids pre-filled on the hangar shelf so paging is visible (the hangar can't persist between sessions)")
  prefillIds: string[] = ["BA169", "CX257", "SAT25544", "VS93", "DL31", "JJ8084", "LX29K", "EY69W", "AY96W", "BY8AB", "GUIDO", "SAT20580"]
  @input
  @hint("Day written as 'when collected' on the pre-filled demo models")
  prefillDay: string = "27 Oct"
  @input
  @hint("Distance of the info card from the user, cm")
  @widget(new SliderWidget(60, 200, 5))
  cardDistanceCm: number = 120
  @input
  @hint("How far beside the tapped object the card opens, degrees (to its right)")
  @widget(new SliderWidget(0, 30, 0.5))
  cardBesideDeg: number = 10
  @input
  @hint("If the tapped object is further than this from the view centre, the card opens at the view centre instead (degrees)")
  @widget(new SliderWidget(5, 60, 1))
  cardInViewDeg: number = 20
  @input
  @hint("Print state changes to the log")
  debugLogs: boolean = true
  @ui.group_end

  private mode: SkyMode = "sky"
  private cardId = ""
  private pinCardSeen = false // the pinned vehicle's card has been opened once; the next tap with it closed unpins
  private collectedCount = 0
  private preloaded = false
  private lastCollectedText = ""
  private prevTrigger: Map<Interactor, boolean> = new Map()
  private ready = false

  onAwake(): void {
    const missing = [
      ["cameraObject", this.cameraObject], ["sky", this.sky], ["held", this.held], ["shelf", this.shelf],
      ["shelfUI", this.shelfUI], ["radar", this.radar], ["arrows", this.arrows], ["menuBar", this.menuBar],
      ["infoCard", this.infoCard], ["labels", this.labels], ["audio", this.audio]
    ].filter((x) => !x[1]).map((x) => x[0])
    if (missing.length > 0) {
      print("SkyHangarMain: required @input not wired: " + missing.join(", "))
      return
    }
    this.createEvent("OnStartEvent").bind(() => this.start())
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  // ======================= public state (for tests) =======================
  getMode(): SkyMode { return this.mode }
  isAllRoutesOn(): boolean { return this.routesOn }
  isReady(): boolean { return this.ready }
  getCardFlightId(): string { return this.infoCard.getShownId() }
  isCardVisible(): boolean { return this.infoCard.isVisible() }
  getCardText(row: string): string { return this.infoCard.getText(row) }
  getCardWorldPos(): vec3 { return this.infoCard.getWorldPos() }
  getCardTab(): string { return this.infoCard.getActiveTab() }
  getCardRouteProgress(): number { return this.infoCard.getRouteProgress() }
  /** Name of the side-view aircraft model shown in the card ("" if none). */
  getCardImageModelName(): string {
    const a = this.infoCard.getImageAnchor()
    return a && a.getChildrenCount() > 0 ? a.getChild(0).name : ""
  }
  isCardFollowing(): boolean { return this.infoCard.isFollowing() }
  getAimedId(): string { return this.sky.getAimedId() }
  getTrailFlightId(): string { return this.sky.getTrailFlightId() }
  isTrailVisible(): boolean { return this.sky.isTrailVisible() }
  getTrailLabelText(): string { return this.labels.getTrailLabelText() }
  /** [originCode, destCode] of the current trail's end labels ([] when none are shown). */
  getTrailEndpointLabels(): string[] {
    const t = this.labels.getTrailLabelText()
    return t ? t.split(" → ") : []
  }
  getTrailPointCount(): number { return this.sky.getTrailPointCount() }
  trailHasLandingPath(): boolean { return this.sky.trailHasLandingPath() }
  isAimReticleVisible(): boolean { return this.sky.isAimReticleVisible() }
  getAimReticleText(): string { return this.labels.getReticleLabelText() }
  getSkyMarkerAngularSizeDeg(): number { return this.sky.getMarkerAngularSizeDeg() }
  getHeldObjectId(): string { return this.held.getHeldId() }
  /** none / flyingIn / held / collecting / returningToSky / thrown / returning / resting */
  getHeldState(): string { return this.held.getState() }
  isPadVisible(): boolean { return this.held.isPadVisible() }
  isPadGlowing(): boolean { return this.held.isPadGlowing() }
  isSkyPadVisible(): boolean { return this.held.isSkyPadVisible() }
  isSkyPadGlowing(): boolean { return this.held.isSkyPadGlowing() }
  isRotorSpinning(): boolean { return this.held.isRotorSpinning() }
  getCollectedCount(): number { return this.collectedCount }
  getShelfCount(): number { return this.shelf.getCount() }
  /** Plaque text for a collection index (0 = first pre-filled model), whatever page it is on. */
  getShelfPlaqueText(slot: number): string {
    const e = this.shelf.getEntries()[slot]
    return e ? this.plaqueLines(e).join(" | ") : ""
  }
  getLastCollectedText(): string { return this.lastCollectedText }
  isStampVisible(): boolean { return this.labels.isStampVisible() }
  isRadarVisible(): boolean { return this.mode === "radar" }
  isHangarVisible(): boolean { return this.mode === "hangar" }
  getRadarBlipCount(): number { return this.radar.getBlipCount() }
  getHangarPage(): number { return this.shelf.getPage() }
  getHangarPageCount(): number { return this.shelf.getPageCount() }
  getHangarCounterText(): string { return this.shelfUI.getCounterText() }
  getHangarVisibleIds(): string[] { return this.shelf.getVisibleIds() }
  getHangarSort(): string { return this.shelf.getSort() }
  isEdgeArrowVisible(): boolean { return this.arrows.isArrowVisible() }
  getNearestArrowLabel(): string { return this.arrows.getNearestLabel() }
  getNearestArrowId(): string { return this.arrows.getNearestId() }
  getVisibleSkyCount(): number { return this.arrows.getVisibleSkyCount() }
  getSkyMarkerCount(kind?: string): number { return this.sky.getMarkerCount(kind) }
  getSkyMarkerColor(kind: string): vec4 { return this.sky.getMarkerColor(kind) }
  getSkyObjectWorldPos(id: string): vec3 | null { return this.sky.getMarkerWorldPos(id) }
  isMenuBright(): boolean { return this.menuBar.isBright() }
  isMenuInView(): boolean { return this.menuBar.isInView() }
  getMenuWorldPos(): vec3 { return this.menuBar.getWorldPos() }

  // ======================= test / automation hooks =======================
  /** Simulate aiming at a sky object ("" clears). */
  aimAt(id: string): void { this.sky.simulateAim(id) }
  /** Simulate a quick pinch on a sky object. */
  tapSkyObject(id: string): boolean { return this.sky.simulateTap(id) }
  /** Simulate a pinch-hold-drag on a sky object; the model arrives in the hand and stays held. */
  pullSkyObject(id: string): boolean {
    const info = this.sky.getInfo(id)
    const pos = this.sky.getMarkerWorldPos(id)
    if (!info || !pos) return false
    this.held.beginScriptedPull(info, pos)
    this.audio.play("pull")
    return true
  }
  moveHeldOverPad(): void { this.held.moveOverPad() }
  moveHeldOverSkyPad(): void { this.held.moveOverSkyPad() }
  /** Release the held model: true = hangar pad, "sky" = Sky return pad, false = elsewhere (throw), omitted = real position. */
  releaseHeld(overPad?: boolean | "sky"): void { this.held.release(overPad === undefined ? null : overPad) }
  /** Send the held / resting model back to the sky (what the Sky return pad does on release). */
  sendHeldToSky(): boolean { return this.held.sendToSky() }
  openSky(): void { this.setMode("sky") }
  openRadar(): void { this.setMode("radar") }
  openHangar(): void { this.setMode("hangar") }
  tapRadarBlip(id: string): boolean { return this.radar.simulateBlipTap(id) }
  closeCard(): void { this.hideCard() }
  setCardTab(tab: string): void { this.infoCard.setTab(tab === "route" ? "route" : "info") }
  hangarNextPage(): boolean { return this.shelf.nextPage() }
  hangarPrevPage(): boolean { return this.shelf.prevPage() }
  setHangarSort(sort: string): void { this.shelf.setSort(sort as any) }

  // ======================= flow =======================
  private start(): void {
    this.sky.onAim.add((info) => this.log("aim " + (info ? info.id : "-")))
    this.sky.onTap.add((info) => this.onSkyTap(info))
    this.sky.onTapEmpty.add(() => this.onSkyTapEmpty())
    this.sky.onPullStart.add((req) => this.onSkyPull(req))
    this.held.onCollected.add((info) => this.onCollected(info))
    this.held.onThrown.add((info) => {
      this.audio.play("throw")
      this.log("thrown " + info.id)
    })
    this.held.onReturned.add((info) => this.log("returned " + info.id))
    this.held.onSentToSky.add((info) => this.log("sent back to sky " + info.id))
    this.radar.onBlipTap.add((info) => this.onBlipTap(info))
    this.shelf.onInspect.add((req) => this.onInspect(req))
    this.shelf.onTap.add((tap) => this.onShelfTap(tap))
    // Radar and Hangar are toggled panels (tap the open one again to return to the sky); Routes is an overlay on the sky view.
    this.menuBar.onRadar.add(() => this.setMode(this.mode === "radar" ? "sky" : "radar"))
    this.menuBar.onHangar.add(() => this.setMode(this.mode === "hangar" ? "sky" : "hangar"))
    this.menuBar.onAllRoutes.add(() => {
      if (this.mode !== "sky") {
        this.routesOn = true // tapping Routes while a panel is open closes it and shows the sky with routes on
        this.applyRoutes()
        this.setMode("sky")
        return
      }
      this.audio.play("menu")
      this.routesOn = !this.routesOn
      this.applyRoutes()
    })
    this.infoCard.setMenuTopProvider(() => this.menuBar.getTopViewAngleDeg())
    this.infoCard.onClose.add(() => this.hideCard())
    this.shelf.onPageChanged.add(() => this.pushShelfView())
    this.shelfUI.onPrev.add(() => {
      this.audio.play("menu")
      this.shelf.prevPage()
    })
    this.shelfUI.onNext.add(() => {
      this.audio.play("menu")
      this.shelf.nextPage()
    })
    this.shelfUI.onSortToggle.add(() => {
      this.audio.play("menu")
      this.shelf.toggleSort()
    })
    this.shelfUI.configure(this.shelf.visibleSlots, this.shelf.controlsLocalPos())
    this.setRootVisible(this.shelf.sceneObject, false)
    this.setRootVisible(this.radar.sceneObject, false)
  }

  private layerTick = 0
  private lastCardUp = false

  private routesOn = false
  private applyRoutes(): void {
    this.sky.setAllRoutes(this.routesOn)
    this.menuBar.setAllRoutesOn(this.routesOn)
    this.log("all routes " + this.routesOn)
  }

  private setMode(mode: SkyMode): void {
    this.audio.play("menu")
    this.mode = mode
    this.menuBar.setActiveMode(mode)
    if (mode === "radar") this.radar.openInFront()
    if (mode === "hangar") this.shelf.openInFront()
    this.setRootVisible(this.radar.sceneObject, mode === "radar")
    this.setRootVisible(this.shelf.sceneObject, mode === "hangar")
    this.applyLayering()
    this.arrows.setSuppressed(mode !== "sky")
    this.log("mode " + mode)
  }

  /** All UI renders in front of every world-space sky element (trails, tags, reticle, markers, arrows). */
  private applyLayering(): void {
    for (const o of [this.menuBar.sceneObject, this.infoCard.sceneObject, this.radar.sceneObject, this.shelf.sceneObject, this.shelfUI.sceneObject]) setRenderOrderTree(o, UI_RENDER_ORDER)
    this.held.applyUiOrder(UI_RENDER_ORDER)
    this.labels.applyUiOrder()
  }

  /** Panels are hidden by scale so UIKit / layout components keep their normal init order. */
  private setRootVisible(root: SceneObject, on: boolean): void {
    // Once everything has started, a hidden panel is also disabled so its meshes cost no draw calls (disabling earlier would hold back OnStart).
    if (on) root.enabled = true
    root.getTransform().setLocalScale(on ? vec3.one() : vec3.zero())
    if (!on && this.ready) root.enabled = false
  }

  private onSkyTap(info: SkyObjectInfo): void {
    this.audio.play("tap")
    // Pin flow: tap 1 pins (trail stays); tap 2 on the pinned vehicle opens its card; tap 3 closes the card (pin stays);
    // a further tap on it with the card closed unpins. Another vehicle moves the pin; empty sky unpins (onSkyTapEmpty).
    if (this.cardId === info.id) {
      this.hideCard()
      return
    }
    if (this.sky.getPinnedId() !== info.id) {
      if (this.cardId) this.hideCard()
      this.sky.setPinnedTrail(info.id)
      this.pinCardSeen = false
      this.log("pin " + info.id)
      return
    }
    if (this.pinCardSeen) {
      this.sky.setPinnedTrail("")
      this.pinCardSeen = false
      this.log("unpin " + info.id)
      return
    }
    this.pinCardSeen = true
    const ct = this.cameraObject.getTransform()
    const camPos = ct.getWorldPosition()
    const camRot = ct.getWorldRotation()
    const fwd = camRot.multiplyVec3(new vec3(0, 0, -1))
    const markerPos = this.sky.getMarkerWorldPos(info.id) ?? camPos.add(fwd.uniformScale(400))
    let dir = markerPos.sub(camPos).normalize()
    // The card always opens at its fixed spot in front of the head; the tapped object only sets where it drops from.
    const off = Math.acos(Math.max(-1, Math.min(1, dir.dot(fwd)))) / DEG
    if (off > this.cardInViewDeg) dir = fwd
    const from = camPos.add(dir.uniformScale(this.cardDistanceCm))
    this.infoCard.showInfo(this.cardContent(info), from, from)
    this.populateCardExtras(info)
    this.cardId = info.id
    this.sky.setPinnedTrail(info.id)
    this.log("card " + info.id)
  }

  private onBlipTap(info: SkyObjectInfo): void {
    this.audio.play("tap")
    const camPos = this.cameraObject.getTransform().getWorldPosition()
    const radarPos = this.radar.sceneObject.getTransform().getWorldPosition()
    const blip = this.radar.getBlipObject(info.id)
    const from = blip ? blip.getTransform().getWorldPosition() : radarPos
    this.infoCard.showInfo(this.cardContent(info), from, from) // same fixed spot as sky taps
    this.populateCardExtras(info)
    this.cardId = info.id
    this.pinCardSeen = true
    this.sky.setPinnedTrail(info.id)
    this.log("card(radar) " + info.id)
  }

  /** Closes the card only; the trail stays pinned. */
  private hideCard(): void {
    this.infoCard.hide()
    this.cardId = ""
  }

  private onSkyTapEmpty(): void {
    this.audio.play("tap")
    if (this.cardId) this.hideCard()
    if (this.sky.getPinnedId()) this.log("unpin (empty sky)")
    this.sky.setPinnedTrail("")
    this.pinCardSeen = false
  }

  private onSkyPull(req: PullRequest): void {
    this.audio.play("pull")
    this.held.beginPull(req.info, req.worldPos, req.interactor)
    this.log("pull " + req.info.id)
  }

  /** Hangar inspect: a pinched-and-held shelf model comes into the hand; it goes back to its slot or to the sky on release. */
  private onInspect(req: InspectRequest): void {
    this.held.finishShelfReturn()
    if (this.held.getState() !== "none") return
    const id = req.info.id
    this.audio.play("pull")
    this.shelf.setEntryHidden(id, true)
    this.held.beginInspect(req.info, req.fromWorld, req.interactor, this.inspectHooks(id))
    this.log("inspect " + id)
  }

  private inspectHooks(id: string): InspectHooks {
    return {
      slotPos: () => this.shelf.revealEntry(id),
      shelfPos: () => this.shelf.getShelfWorldPos(),
      shelfSpanCm: this.shelf.modelSpanCm,
      onReturned: () => this.shelf.setEntryHidden(id, false),
      onSentToSky: () => this.shelf.removeEntry(id)
    }
  }

  /** Quick tap on the shelf: a model goes to inspect mode; any tap while one is inspected sends it back (one at a time). */
  private onShelfTap(tap: ShelfTap): void {
    if (this.held.isViewing()) {
      this.held.endView()
      return
    }
    if (tap.info) this.held.finishShelfReturn()
    if (!tap.info || this.held.getState() !== "none") return
    const id = tap.info.id
    this.audio.play("tap")
    this.shelf.setEntryHidden(id, true)
    this.held.beginView(tap.info, tap.fromWorld, this.inspectHooks(id))
    this.log("view " + id)
  }

  private onCollected(info: SkyObjectInfo): void {
    this.audio.play("collect")
    this.collectedCount++
    const when = this.nowText()
    this.addToShelf(info, this.collectedPlace, when)
    this.labels.showCollectedStamp(this.held.getPadWorldPos().add(new vec3(0, 9, 0)), info.flight + " · " + when)
    this.log("collected " + info.id + " (shelf " + this.shelf.getCount() + ")")
  }

  private plaqueLines(e: ShelfEntry): string[] {
    const info = e.info
    const head = info.kind === "satellite" ? info.airline + " · " + info.aircraftType + " · " + info.flight : info.airline + " · " + info.flight
    const route = info.kind === "satellite" ? "Low Earth orbit" : info.kind === "helicopter" ? "Local flight · " + info.aircraftType : !info.origin ? info.aircraftTypeName : info.origin + " → " + info.destination
    return [head, route, e.where + " · " + e.when]
  }

  private addToShelf(info: SkyObjectInfo, where: string, when: string): void {
    const slot = this.shelf.add(info, where, when)
    if (slot < 0) return
    this.lastCollectedText = this.plaqueLines(this.shelf.getEntries()[slot]).join(" | ")
    this.pushShelfView()
  }

  /** Push the current page of the collection into the shelf UI. */
  private pushShelfView(): void {
    const vis = this.shelf.getVisibleEntries()
    for (let i = 0; i < this.shelf.visibleSlots; i++) this.shelfUI.setPlaque(i, vis[i] ? this.plaqueLines(vis[i]) : null)
    this.shelfUI.setControls(this.shelf.getCounterText(), this.shelf.getPage(), this.shelf.getPageCount(), this.shelf.getSort() === "newest" ? "Recent" : "Type")
    const n = this.shelf.getCount()
    this.shelfUI.setTitle("My Hangar · " + n + (n === 1 ? " model" : " models"), this.shelf.titleLocalPos())
  }

  private nowText(): string {
    const d = new Date()
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const pad = (n: number) => (n < 10 ? "0" : "") + n
    return d.getDate() + " " + months[d.getMonth()] + " " + pad(d.getHours()) + ":" + pad(d.getMinutes())
  }

  /** Lines for the aim reticle label block: callsign, code · type, ORIGIN > DEST, timing. */
  private reticleLines(i: SkyObjectInfo): string[] {
    if (i.kind === "satellite") return [i.aircraftType, "NORAD · " + i.flight.replace("NORAD ", ""), "LOW EARTH ORBIT", "Altitude " + (i.altitudeKm ?? 0) + " km"]
    if (i.kind === "helicopter") return [i.callsign, i.aircraftType + " · " + i.registration, "LOCAL FLIGHT", "No filed route"]
    return [
      i.callsign,
      i.airlineIcao + " · " + i.aircraftType,
      i.origin + " > " + i.destination,
      "Departed " + hm(i.departedAgoMin) + " ago · Arriving in " + hm(i.arrivingInMin)
    ]
  }

  /** Route diagram + live side-view model for the card (our own drawing and models; no map tiles, no photos). */
  private populateCardExtras(info: SkyObjectInfo): void {
    this.infoCard.showRoute(buildTrack(info))
    const anchor = this.infoCard.getImageAnchor()
    for (let i = anchor.getChildrenCount() - 1; i >= 0; i--) anchor.getChild(i).destroy()
    const kit = this.sky.partKit
    if (!kit) return
    const holder = makeObj(anchor, "CardModel_" + info.id)
    // Side view: model nose (-Z) turned to +X, a touch of top-down tilt so the silhouette reads.
    holder.getTransform().setLocalRotation(quat.angleAxis(0.18, vec3.right()).multiply(quat.angleAxis(-Math.PI / 2, vec3.up())))
    buildModel(kit, holder, "CardImage_" + info.id, info.kind, info.kind === "satellite" ? 8 : 9.5, styleFor(info.colors, info.kind, true, info.airlineIcao || info.id), info.aircraftType, info.id, !info.airlineIcao)
  }

  private cardContent(i: SkyObjectInfo): CardContent {
    const base = this.cardContentBase(i)
    const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    if (i.kind === "satellite") {
      return {...base, callsign: i.aircraftType, codeTag: "NORAD", typeTag: i.flight.replace("NORAD ", ""), originCode: "LEO", originCity: "Low Earth orbit",
        originNote: "Orbit from TLE", destCode: "", destCity: "", destNote: "", altitudeValue: fmt(i.altitudeKm ?? i.altitudeFt / 3281), altitudeUnit: "KM",
        speedValue: (i.speedKt / 1943.84).toFixed(1), speedUnit: "KM/S", typeName: i.aircraftTypeName}
    }
    if (i.kind === "helicopter") {
      return {...base, callsign: i.callsign, codeTag: "HELI", typeTag: i.aircraftType, originCode: i.registration, originCity: "Local flight",
        originNote: "Seen " + SNAPSHOT_UTC.substring(11, 16) + " UTC", destCode: "", destCity: "", destNote: "", altitudeValue: fmt(i.altitudeFt), altitudeUnit: "FT",
        speedValue: String(i.speedKt), speedUnit: "KT", typeName: i.aircraftTypeName}
    }
    return {...base, callsign: i.callsign, codeTag: i.airlineIcao, typeTag: i.aircraftType, originCode: i.origin, originCity: i.originCity,
      originNote: "Departed " + hm(i.departedAgoMin) + " ago", destCode: i.destination, destCity: i.destinationCity,
      destNote: "Arriving in " + hm(i.arrivingInMin), altitudeValue: fmt(i.altitudeFt), altitudeUnit: "FT", speedValue: String(i.speedKt),
      speedUnit: "KT", typeName: i.aircraftTypeName,
      live: {departedMin: i.departedAgoMin, arrivingMin: i.arrivingInMin, altitudeFt: i.altitudeFt, speedKt: i.speedKt}}
  }

  private cardContentBase(i: SkyObjectInfo): CardContent {
    const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    if (i.kind === "satellite") {
      return {
        id: i.id,
        airline: i.callsign,
        flightLine: i.flight + "  ·  " + i.airline,
        route: "Low Earth orbit",
        times: "Position from TLE at " + SNAPSHOT_UTC.substring(11, 16) + " UTC",
        cities: "Over " + i.lat.toFixed(1) + "°, " + i.lon.toFixed(1) + "°",
        aircraft: i.aircraftTypeName,
        altSpeed: "Altitude " + fmt(i.altitudeKm ?? i.altitudeFt / 3281) + " km  ·  Speed " + (i.speedKt / 1943.84).toFixed(1) + " km/s"
      }
    }
    if (i.kind === "helicopter") {
      return {
        id: i.id,
        airline: i.airline,
        flightLine: i.flight + "  ·  " + i.registration,
        route: "Local flight",
        times: (heliTrack(i)?.sparse !== false ? "Recent track (route ahead estimated)" : "No filed route") + "  ·  seen " + SNAPSHOT_UTC.substring(11, 16) + " UTC",
        cities: "Helicopter over west London",
        aircraft: i.aircraftTypeName + " (" + i.aircraftType + ")",
        altSpeed: "Altitude " + fmt(i.altitudeFt) + " ft  ·  Speed " + i.speedKt + " kt"
      }
    }
    return {
      id: i.id,
      airline: i.airline,
      flightLine: i.flight + "  ·  " + i.callsign,
      route: i.origin + "  →  " + i.destination,
      times: "Takeoff " + i.departUtc + "  ·  Landing " + i.arriveUtc + " UTC",
      cities: i.originCity + " → " + i.destinationCity,
      aircraft: i.aircraftTypeName + " (" + i.aircraftType + ")",
      altSpeed: "Altitude " + fmt(i.altitudeFt) + " ft  ·  Speed " + i.speedKt + " kt"
    }
  }

  private update(): void {
    if (!this.sky.isBuilt()) return
    if (!this.preloaded && this.shelf.isReady()) {
      this.preloaded = true
      let n = 0
      for (const id of this.prefillIds) {
        const info = this.sky.getInfo(id)
        if (!info) continue
        // Pre-filled demo models: spread over the afternoon of the snapshot's previous day.
        const minutes = 12 * 60 + 10 + n * 23
        const when = this.prefillDay + " " + Math.floor(minutes / 60) + ":" + ((minutes % 60) < 10 ? "0" : "") + (minutes % 60)
        this.shelf.add(info, this.collectedPlace, when, false)
        n++
      }
      // Fleet examples: one real-type example of every model family not yet on the shelf, so the whole fleet is visible on first open.
      const have: {[family: string]: boolean} = {}
      for (const e of this.shelf.getEntries()) have[familyForInfo(e.info)] = true
      for (const ex of fleetExamples(have)) this.shelf.add(ex.info, ex.where, ex.when, false)
      this.shelf.setPage(0)
      this.pushShelfView()
      this.lastCollectedText = ""
      this.ready = true
      this.setRootVisible(this.radar.sceneObject, this.mode === "radar")
      this.setRootVisible(this.shelf.sceneObject, this.mode === "hangar")
      this.log("ready: " + this.sky.getMarkerCount() + " sky objects, shelf " + this.shelf.getCount())
    }

    // Hangar info tags: every visible vehicle shows its own tag under it (the held one hides its tag while it is in the hand).
    if (this.mode === "hangar") {
      const heldId = this.held.isInspecting() ? this.held.getHeldId() : ""
      const ids = this.shelf.getVisibleIds()
      for (let i = 0; i < this.shelfUI.getPlaqueSlotCount(); i++) {
        if (i < ids.length && ids[i] !== heldId) {
          this.shelfUI.showTag(i, this.shelf.getStandAnchorWorldPos(i).add(new vec3(0, 7 - this.shelf.modelSpanCm * 0.85, 0)))
        } else this.shelfUI.showTag(i, null)
      }
      const headers = this.shelf.getVisibleGroupHeaders()
      for (let i = 0; i < this.shelfUI.getPlaqueSlotCount(); i++) {
        const text = i < headers.length && ids[i] !== heldId ? headers[i] : null
        this.shelfUI.showHeader(i, text, text ? this.shelf.getStandAnchorWorldPos(i).add(new vec3(0, this.shelf.modelSpanCm * 1.15 + 3, 0)) : null)
      }
    } else {
      this.shelfUI.showTag(-1, null)
      for (let i = 0; i < this.shelfUI.getPlaqueSlotCount(); i++) this.shelfUI.showHeader(i, null, null)
    }

    // Trail end labels follow whichever trail is showing (planes: origin + destination codes).
    const tid = this.sky.getTrailFlightId()
    if (tid) {
      const info = this.sky.getInfo(tid)
      if (info && info.kind === "plane") {
        this.labels.setTrailLabels(this.sky.getTrailOriginPos(), info.origin, info.originCity, this.sky.getTrailDestPos(), info.destination, info.destinationCity)
      } else if (this.labels.isTrailLabelsVisible()) {
        this.labels.hideTrailLabels()
      }
    } else if (this.labels.isTrailLabelsVisible()) {
      this.labels.hideTrailLabels()
    }

    // Aim reticle label: only for the aimed object; hidden while its own card is open (the card says it all).
    const aimed = this.sky.getAimedId() || this.sky.getPinnedId()
    const aimedInfo = aimed ? this.sky.getInfo(aimed) : null
    const showReticleLabel = !!aimedInfo && !(this.infoCard.isVisible() && this.infoCard.getShownId() === aimed)
    if (showReticleLabel && aimedInfo) {
      const p = this.sky.getReticleWorldPos() ?? this.sky.getMarkerWorldPos(aimed)!
      this.labels.setReticleLabel(this.reticleLines(aimedInfo), p, true, this.sky.reticleSizeCm * 0.7, this.sky.getRouteSamplesWorld(aimed))
    } else {
      this.labels.setReticleLabel(null, vec3.zero(), false)
    }

    // Pad labels while holding.
    const hs = this.held.getState()
    const holding = hs === "flyingIn" || hs === "held"
    this.labels.setSkyPadRelease(this.held.isInspecting() && this.held.getViewOrigin() !== "sky") // in the Hangar the sky pad is "Release"
    if (holding && this.held.isPadVisible()) {
      const hp = this.held.getPadLabelPose(false)
      const sp = this.held.getPadLabelPose(true)
      this.labels.setPadLabels(hp.pos, sp.pos, true, hp.rot, sp.rot)
    } else {
      this.labels.setPadLabels(vec3.zero(), vec3.zero(), false)
    }

    // Edge arrows are quiet while the user handles a toy in their hand or reads a card.
    const busyHand = hs === "flyingIn" || hs === "held" || hs === "collecting" || hs === "thrown" || hs === "returning" || hs === "returningToSky"
    this.arrows.setSuppressed(this.mode !== "sky" || busyHand || this.infoCard.isVisible())
    this.labels.setArrowLabel(this.arrows.getNearestLabel(), this.arrows.getNearestLabelWorldPos(), this.arrows.isArrowVisible())

    // Radar / card up: the sky's airport tags and reticle label fade out; the radar slides under an open card; the card
    // backing goes more opaque while the radar is visible.
    const cardUp = this.infoCard.isVisible()
    this.labels.setSkyTagsVisible(!(this.mode === "radar" || cardUp))
    this.radar.setDocked(this.mode === "radar" && cardUp)
    this.infoCard.setSolidBacking(this.mode === "radar")
    this.labels.setRadarDim(this.radar.getDim())
    if (cardUp !== this.lastCardUp || this.layerTick++ % 60 === 0) {
      this.lastCardUp = cardUp
      this.applyLayering()
    }

    // Radar range labels while the radar is open
    this.labels.setRadarLabels(this.mode === "radar" ? this.radar.getRangeLabels() : [])

    this.sky.assistActive = this.mode === "sky" && this.held.getState() === "none"
    this.pollTapElsewhere()
  }

  /** "Closes when I tap elsewhere": a pinch that starts on nothing closes the card. */
  private pollTapElsewhere(): void {
    const all = SIK.InteractionManager.getInteractorsByType(InteractorInputType.All)
    for (const it of all) {
      const now = it.isTriggering
      const was = this.prevTrigger.get(it) ?? false
      if (now && !was && it.currentInteractable === null && this.infoCard.isVisible() && !this.sky.hasAssistTarget()) {
        this.hideCard()
        this.log("card closed (tap elsewhere)")
      }
      this.prevTrigger.set(it, now)
    }
  }

  private log(msg: string): void {
    if (this.debugLogs) print("[SkyHangar] " + msg)
  }
}
