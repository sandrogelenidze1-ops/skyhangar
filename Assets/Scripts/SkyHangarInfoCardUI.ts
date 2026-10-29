// SkyHangarInfoCardUI.ts
// Owns: the flight info card as frosted glass (UIKit RoundedRectangle glass + FlexLayout + UIKit Buttons).
// Layout (round 2 #4): callsign large + airline beneath + code/type tags + round × close (top right);
// divider; origin | destination columns (code large, city, "Departed … ago" / "Arriving in …");
// divider; a tab area — Info: ALTITUDE + GROUND SPEED big numerals with small units beside the
// aircraft image (a live side-view of our own model, built by the main script into getImageAnchor())
// and its type name, plus the takeoff/landing line; Route: a simple custom map (SkyHangarRouteMap:
// coastline outlines, route arc, airport codes, a moving vehicle dot) on a deeper glass panel;
// bottom: a Route | Info pill. (The old "Let go" button is gone: the Sky return pad sends a pulled model home.)
// Planes show live values: altitude, ground speed, "Departed ... ago" and "Arriving in ..." tick every second
// by replaying the recorded snapshot along a phase-of-flight profile (see liveProfile()).
// It drops from the tapped object to its spot beside it, faces the user (slightly tilted), and keeps
// that spot in view with a gentle lag. Public API: showInfo, showRoute, hide, setTab, getActiveTab,
// isVisible, getShownId, getText(row), getWorldPos, isFollowing, getImageAnchor. Emits onClose.
// Passive view — the main script decides what to show. Hidden = scaled to zero (UIKit init order safe).

import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {ElementContent} from "SpectaclesUIKit.lspkg/Scripts/Components/Content/ElementContent"
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {MapTrack, RouteMap} from "./SkyHangarRouteMap"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {
  FONT, PALETTE, RADIUS, SPACE, TEXT, addDivider, applyFontToContent, addFlexChild, addTextRow, glassPanel, makeFlex, obj, roleSize, rowHeight,
  FlexDirection, FlexJustify, FlexAlign
} from "./SkyHangarSharedUI"

const ICON_CLOSE = requireAsset("../Icons/close.png") as Texture

// Card look: mid-blue frosted glass (not pale: it must read on an additive display), lighter tiles, one accent.
const CARD_TINT = new vec4(0.16, 0.29, 0.62, 0.78)
const CARD_GLOW = new vec4(0.55, 0.72, 1.0, 0.14)
const TILE_TINT = new vec4(0.3, 0.48, 0.88, 0.42)
const TAB_ACTIVE_TEXT = new vec4(0.06, 0.13, 0.32, 1) // dark text on the white active tab (~14:1)

/** UIKit keeps text/icon colours private; switch theme colours off and write the same colour for every state. */
function tintContent(ec: ElementContent, text: vec4, icon: vec4): void {
  const a = ec as any
  a._useThemeColors = false
  for (const st of ["_defaultTextColor", "_hoveredTextColor", "_triggeredTextColor", "_inactiveTextColor"]) a[st] = text
  for (const st of ["_defaultIconTint", "_hoveredIconTint", "_triggeredIconTint", "_inactiveIconTint"]) a[st] = icon
  ec.markColorsDirty()
}

/** Legacy content strings (kept verbatim for getText) + the structured fields the glass layout shows. */
export interface CardContent {
  id: string
  airline: string
  flightLine: string
  route: string
  times: string
  cities: string
  aircraft: string
  altSpeed: string
  callsign?: string
  codeTag?: string
  typeTag?: string
  originCode?: string
  originCity?: string
  originNote?: string
  destCode?: string
  destCity?: string
  destNote?: string
  altitudeValue?: string
  altitudeUnit?: string
  speedValue?: string
  speedUnit?: string
  typeName?: string
  /** Planes only: the recorded snapshot the card replays (minutes since takeoff / until landing, feet, knots). */
  live?: {departedMin: number; arrivingMin: number; altitudeFt: number; speedKt: number}
}

const CLIMB_S = 25 * 60
const DESCENT_S = 25 * 60
const smooth = (x: number) => {
  const u = Math.max(0, Math.min(1, x))
  return u * u * (3 - 2 * u)
}

/**
 * The recording holds ONE altitude/speed sample per flight, so the card replays it along a climb - cruise - descent
 * profile of the flight (time since takeoff / until landing). The profile is anchored so it passes exactly through the
 * recorded sample at the moment the card opens.
 */
export function liveProfile(live: NonNullable<CardContent["live"]>, elapsedS: number): {departedS: number; arrivingS: number; altitudeFt: number; speedKt: number} {
  const dep0 = live.departedMin * 60
  const arr0 = live.arrivingMin * 60
  const dep = dep0 + elapsedS
  const arr = Math.max(0, arr0 - elapsedS)
  const shape = (d: number, a: number) => 0.04 + 0.96 * smooth(d / CLIMB_S) * smooth(a / DESCENT_S)
  const f0 = shape(dep0, arr0)
  const f = shape(dep, arr)
  const cruiseAlt = Math.min(41000, live.altitudeFt / f0)
  const cruiseSpd = Math.min(520, live.speedKt / (0.6 + 0.4 * f0))
  const alt = Math.max(0, live.altitudeFt + cruiseAlt * (f - f0))
  const spd = Math.max(0, live.speedKt + cruiseSpd * 0.4 * (f - f0))
  return {departedS: dep, arrivingS: arr, altitudeFt: alt, speedKt: spd}
}

function hms(sec: number): string {
  const t = Math.max(0, Math.floor(sec))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  return h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s
}
const withCommas = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")

export type CardTab = "info" | "route"

@component
export class SkyHangarInfoCardUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarInfoCardUI – glass flight card</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("The main camera SceneObject (card faces it and follows it)")
  cameraObject!: SceneObject
  @input
  @hint("Unlit material cloned for the Route tab map lines (the same one the sky trails use)")
  mapMaterial!: Material
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Glass panel width, cm")
  @widget(new SliderWidget(24, 50, 0.5))
  panelWidthCm: number = 34
  @input
  @hint("Distance the card is read from, cm (scales the type)")
  @widget(new SliderWidget(60, 200, 5))
  readDistanceCm: number = 120
  @input
  @hint("Distance of the card from the head, cm (about 0.9 m)")
  @widget(new SliderWidget(60, 140, 1))
  placeDistanceCm: number = 90
  @input
  @hint("Elevation of the card centre above eye level, degrees")
  @widget(new SliderWidget(0, 15, 0.5))
  aboveEyeDeg: number = 4
  @input
  @hint("Gap kept between the card bottom and the menu bar top, degrees")
  @widget(new SliderWidget(0, 8, 0.5))
  menuClearanceDeg: number = 2.5
  @input
  @hint("Seconds for the card to drop from the aircraft to its spot")
  @widget(new SliderWidget(0.1, 2, 0.05))
  dropSeconds: number = 0.6
  @input
  @hint("Follow lag: seconds for the card to catch up when you move or turn")
  @widget(new SliderWidget(0.2, 3, 0.05))
  followSeconds: number = 0.9
  @input
  @hint("Perspective tilt toward the user, degrees")
  @widget(new SliderWidget(0, 25, 0.5))
  tiltDeg: number = 7
  @input
  @hint("Tab shown when a card opens")
  @widget(new ComboBoxWidget([new ComboBoxItem("Info", "info"), new ComboBoxItem("Route", "route")]))
  defaultTab: string = "info"
  @ui.group_end

  private panelRoot!: SceneObject
  private glass!: RoundedRectangle
  private rows: {[k: string]: Text} = {}
  private content: CardContent | null = null
  private visible = false
  private shownId = ""
  private t = 1
  private from = vec3.zero()
  private localOffset = new vec3(0, 0, -120)
  private following = false
  private menuTop: (() => number) | null = null
  private elevDeg = 4
  private fit = 1
  private camComp: Camera | null = null
  private tab: CardTab = "info"
  private infoPane!: SceneObject
  private routePane!: SceneObject
  private imageAnchor!: SceneObject
  private tabInfo!: Button
  private tabRoute!: Button
  private tabVisuals: {[k: string]: {fill: SceneObject; ec: ElementContent}} | null = null
  private map!: RouteMap
  private routeW = 30
  private routeH = 9
  private routeProgress = 0
  private _onClose = new Event<void>()
  get onClose(): PublicApi<void> { return this._onClose.publicApi() }
  private liveStart = 0

  onAwake(): void {
    this.tab = this.defaultTab === "route" ? "route" : "info"
    this.build()
    this.applyScale(0)
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  // ---------- public API ----------
  isVisible(): boolean { return this.visible }
  getShownId(): string { return this.visible ? this.shownId : "" }
  /** Legacy rows: airline, flight, route, times, cities, aircraft, altSpeed (same content strings as before). */
  getText(key: string): string {
    const c = this.content
    if (!c) return ""
    const map: {[k: string]: string} = {
      airline: c.airline, flight: c.flightLine, route: c.route, times: c.times, cities: c.cities, aircraft: c.aircraft, altSpeed: c.altSpeed
    }
    if (map[key] !== undefined) return map[key]
    return this.rows[key] ? this.rows[key].text : ""
  }
  getWorldPos(): vec3 { return this.sceneObject.getTransform().getWorldPosition() }
  isFollowing(): boolean { return this.visible && this.following }
  getActiveTab(): CardTab { return this.tab }
  getRouteProgress(): number { return this.routeProgress }
  /** Where the main script places the live side-view aircraft model (Info tab). ~9 cm wide slot, nose to +X. */
  getImageAnchor(): SceneObject { return this.imageAnchor }

  /** Elevation (deg, view-relative) of the menu bar top edge; the card is kept above it. */
  setMenuTopProvider(fn: () => number): void { this.menuTop = fn }

  setTab(tab: CardTab): void {
    this.tab = tab === "route" ? "route" : "info"
    this.infoPane.getTransform().setLocalScale(this.tab === "info" ? vec3.one() : vec3.zero())
    this.routePane.getTransform().setLocalScale(this.tab === "route" ? vec3.one() : vec3.zero())
    this.applyTabVisuals()
    if (this.tab === "route" && this.map) this.map.update(getTime() - this.liveStart)
  }

  /** Show content; the card drops from fromWorld to targetWorld, then keeps that spot relative to the head. */
  showInfo(c: CardContent, targetWorld: vec3, fromWorld: vec3): void {
    this.content = c
    const set = (k: string, v: string | undefined) => {
      if (this.rows[k]) this.rows[k].text = v ?? ""
    }
    set("callsign", c.callsign ?? c.flightLine)
    set("airlineName", c.airline)
    set("codeTag", c.codeTag ?? "")
    set("typeTag", c.typeTag ?? "")
    set("originCode", c.originCode ?? "")
    set("originCity", (c.originCity ?? "").toUpperCase())
    set("originNote", c.originNote ?? "")
    set("destCode", c.destCode ?? "")
    set("routeArrow", c.destCode ? "→" : "")
    set("destCity", (c.destCity ?? "").toUpperCase())
    set("destNote", c.destNote ?? "")
    set("altValue", c.altitudeValue ?? "")
    set("altUnit", c.altitudeUnit ?? "")
    set("spdValue", c.speedValue ?? "")
    set("spdUnit", c.speedUnit ?? "")
    set("typeName", c.typeName ?? c.aircraft)
    set("timesLine", c.times)
    this.shownId = c.id
    this.liveStart = getTime()
    this.visible = true
    this.from = fromWorld
    this.t = 0
    // Always the same comfortable spot in front of the head (the tapped object / radar blip only sets where the card drops from).
    void targetWorld
    this.elevDeg = this.aboveEyeDeg
    this.placeInFront()
    this.sceneObject.getTransform().setWorldPosition(fromWorld)
    this.setTab(this.defaultTab === "route" ? "route" : "info")
  }

  /** Route tab map: fit to the track, draw coastline + route, and put the dot where the vehicle is now. */
  showRoute(track: MapTrack): void {
    this.map.show(track, getTime() - this.liveStart)
    this.routeProgress = this.map.getProgress()
  }

  hide(): void {
    this.visible = false
    this.shownId = ""
    this.following = false
    this.applyScale(0)
  }

  // ---------- build ----------
  private build(): void {
    const D = this.readDistanceCm
    const k = D / 110
    const W = this.panelWidthCm
    const pad = SPACE.l * k
    const inner = W - pad * 2
    this.sceneObject.createComponent("Component.Canvas")
    this.panelRoot = obj(this.sceneObject, "InfoCardPanel")
    this.panelRoot.getTransform().setLocalRotation(quat.angleAxis(-this.tiltDeg * (Math.PI / 180), vec3.up()).multiply(quat.angleAxis(-this.tiltDeg * 0.5 * (Math.PI / 180), vec3.right())))
    // Mid-blue frosted glass (deep enough for white type on an additive display) with a thin bright edge.
    const g = glassPanel(this.panelRoot, "InfoCardGlass", new vec2(W, 30), {radiusCm: RADIUS.l * k, tint: CARD_TINT, glow: CARD_GLOW, edgeCm: 0.14})
    this.glass = g.rect
    const content = obj(this.panelRoot, "Content", new vec3(0, 0, 0.6))
    const col = makeFlex(content, "Column", FlexDirection.Column, W, -1, {gap: SPACE.m * k, padY: pad, padX: pad, justify: FlexJustify.Start, align: FlexAlign.Center})
    col.flex.onLayoutComplete.add((r) => (this.glass.size = new vec2(r.containerWidth, r.containerHeight)))
    const L = HorizontalAlignment.Left
    const R = HorizontalAlignment.Right

    // Header: [callsign (largest) + airline] [code / type chips] [x close]
    const closeD = 6.0 * k
    const hdrH = Math.max(rowHeight("Display", D) + rowHeight("Body", D), closeD)
    const hdr = makeFlex(col.so, "Header", FlexDirection.Row, inner, hdrH, {gap: SPACE.m * k, justify: FlexJustify.SpaceBetween, align: FlexAlign.Center})
    addFlexChild(hdr.so, col.flex, inner, hdrH)
    const tagW = inner * 0.2
    const leftW = inner - tagW - closeD - SPACE.m * k * 2
    const left = makeFlex(hdr.so, "HeaderLeft", FlexDirection.Column, leftW, hdrH, {justify: FlexJustify.Center, align: FlexAlign.Start})
    addFlexChild(left.so, hdr.flex, leftW, hdrH)
    this.rows.callsign = addTextRow(left.so, left.flex, "Callsign", "EZY26DV", "Display", leftW, rowHeight("Display", D), TEXT.primary, D, L)
    this.rows.airlineName = addTextRow(left.so, left.flex, "AirlineName", "Swiss International Air Lines", "Body", leftW, rowHeight("Body", D), TEXT.secondary, D, L)
    const tags = makeFlex(hdr.so, "Tags", FlexDirection.Column, tagW, hdrH, {gap: SPACE.xs * k, justify: FlexJustify.Center, align: FlexAlign.Center})
    addFlexChild(tags.so, hdr.flex, tagW, hdrH)
    this.rows.codeTag = this.addTag(tags.so, tags.flex, "CodeTag", "EZY", tagW, D)
    this.rows.typeTag = this.addTag(tags.so, tags.flex, "TypeTag", "A320", tagW, D)
    this.makeButton(hdr.so, hdr.flex, "InfoCardClose", "", ICON_CLOSE, closeD, closeD, D, "Round", () => this._onClose.invoke(), "close")

    addDivider(col.so, col.flex, "DividerTop", inner)

    // Route, big: ORIGIN -> DESTINATION with the city and the time note under each code
    const odH = rowHeight("Title", D) + rowHeight("Label", D) + rowHeight("Body", D)
    const od = makeFlex(col.so, "OriginDest", FlexDirection.Row, inner, odH, {gap: SPACE.m * k, justify: FlexJustify.SpaceBetween, align: FlexAlign.Center})
    addFlexChild(od.so, col.flex, inner, odH)
    const colW = inner * 0.4
    const oc = makeFlex(od.so, "Origin", FlexDirection.Column, colW, odH, {justify: FlexJustify.Center, align: FlexAlign.Start})
    addFlexChild(oc.so, od.flex, colW, odH)
    this.rows.originCode = addTextRow(oc.so, oc.flex, "OriginCode", "LTN", "Title", colW, rowHeight("Title", D), TEXT.primary, D, L)
    this.rows.originCity = addTextRow(oc.so, oc.flex, "OriginCity", "LONDON", "Label", colW, rowHeight("Label", D), TEXT.secondary, D, L)
    this.rows.originNote = addTextRow(oc.so, oc.flex, "OriginNote", "Departed 0:21 ago", "Body", colW, rowHeight("Body", D), TEXT.secondary, D, L)
    this.rows.originNote.horizontalOverflow = HorizontalOverflow.Overflow // "Departed 0:21:07 ago" is wider than its column; the middle is free
    const arrowW = inner * 0.14
    const mid = makeFlex(od.so, "RouteArrow", FlexDirection.Column, arrowW, odH, {justify: FlexJustify.Start, align: FlexAlign.Center})
    addFlexChild(mid.so, od.flex, arrowW, odH)
    this.rows.routeArrow = addTextRow(mid.so, mid.flex, "RouteArrowText", "→", "Title", arrowW, rowHeight("Title", D), TEXT.accent, D)
    const dc = makeFlex(od.so, "Destination", FlexDirection.Column, colW, odH, {justify: FlexJustify.Center, align: FlexAlign.End})
    addFlexChild(dc.so, od.flex, colW, odH)
    this.rows.destCode = addTextRow(dc.so, dc.flex, "DestCode", "NAP", "Title", colW, rowHeight("Title", D), TEXT.primary, D, R)
    this.rows.destCity = addTextRow(dc.so, dc.flex, "DestCity", "NAPLES", "Label", colW, rowHeight("Label", D), TEXT.secondary, D, R)
    this.rows.destNote = addTextRow(dc.so, dc.flex, "DestNote", "Arriving in 2:23", "Body", colW, rowHeight("Body", D), TEXT.secondary, D, R)
    this.rows.destNote.horizontalOverflow = HorizontalOverflow.Overflow

    addDivider(col.so, col.flex, "DividerMid", inner)

    // Tab area (fixed height so the card doesn't jump between tabs)
    const tileH = rowHeight("Label", D) * 2 + rowHeight("Display", D) + 1.0 * k
    const paneH = tileH + 0.9 * k + 5.4 * k
    const area = obj(col.so, "TabArea", new vec3(0, 0, 0.02))
    addFlexChild(area, col.flex, inner, paneH)
    this.buildInfoPane(area, inner, paneH, tileH, D)
    this.buildRoutePane(area, inner, paneH, D)

    // Bottom: segmented Route | Info pill (active = filled white with dark text)
    const btnH = 4.4 * k
    const bottom = makeFlex(col.so, "Bottom", FlexDirection.Row, inner, btnH + 0.6, {gap: SPACE.m * k, justify: FlexJustify.Center, align: FlexAlign.Center})
    addFlexChild(bottom.so, col.flex, inner, btnH + 0.6)
    const pillW = 17.5 * k
    const pill = obj(bottom.so, "TabPill", new vec3(0, 0, 0.02))
    glassPanel(pill, "TabPillGlass", new vec2(pillW, btnH + 0.5), {radiusCm: (btnH + 0.5) / 2, tint: new vec4(0.08, 0.16, 0.4, 0.55), glow: new vec4(1, 1, 1, 0), edge: PALETTE.glassEdge, edgeCm: 0.1})
    const pillRow = makeFlex(pill, "PillRow", FlexDirection.Row, pillW, btnH, {gap: 0.3 * k, justify: FlexJustify.Center, align: FlexAlign.Center})
    pillRow.so.getTransform().setLocalPosition(new vec3(0, 0, 0.3))
    addFlexChild(pill, bottom.flex, pillW, btnH + 0.5)
    const tabW = pillW / 2 - 0.5
    const mkTab = (name: string, label: string, onTap: () => void) => {
      const holder = obj(pillRow.so, name + "Holder", new vec3(0, 0, 0.02))
      addFlexChild(holder, pillRow.flex, tabW, btnH)
      const fill = glassPanel(holder, name + "Fill", new vec2(tabW, btnH), {tint: new vec4(1, 1, 1, 0.97), glow: new vec4(1, 1, 1, 0), edge: new vec4(1, 1, 1, 1), edgeCm: 0.1, radiusCm: btnH / 2})
      fill.so.getTransform().setLocalPosition(new vec3(0, 0, 0.02))
      const btn = this.makeButton(holder, null, name, label, null, tabW, btnH, D, "Capsule", onTap, "tab")
      return {btn, fill: fill.so, ec: btn.sceneObject.getComponent(ElementContent.getTypeName()) as ElementContent}
    }
    const tr = mkTab("InfoCardTabRoute", "Route", () => this.setTab("route"))
    const ti = mkTab("InfoCardTabInfo", "Info", () => this.setTab("info"))
    this.tabRoute = tr.btn
    this.tabInfo = ti.btn
    this.tabVisuals = {route: {fill: tr.fill, ec: tr.ec}, info: {fill: ti.fill, ec: ti.ec}}
    this.setTab(this.tab)
  }

  private buildInfoPane(area: SceneObject, w: number, h: number, tileH: number, D: number): void {
    const k = D / 110
    this.infoPane = obj(area, "InfoPane", new vec3(0, 0, 0.02))
    const L = HorizontalAlignment.Left
    // Two stat tiles: ALTITUDE | GROUND SPEED
    const gap = 0.9 * k
    const tileW = (w - gap) / 2
    const yTiles = h / 2 - tileH / 2
    for (const [i, key, label] of [[0, "alt", "ALTITUDE"], [1, "spd", "GROUND SPEED"]] as [number, string, string][]) {
      const x = (i === 0 ? -1 : 1) * (tileW / 2 + gap / 2)
      const tile = obj(this.infoPane, key === "alt" ? "AltitudeTile" : "SpeedTile", new vec3(x, yTiles, 0.02))
      glassPanel(tile, "StatTileGlass", new vec2(tileW, tileH), {tint: TILE_TINT, glow: new vec4(0.7, 0.85, 1, 0.1), edge: PALETTE.glassEdge, edgeCm: 0.08, radiusCm: RADIUS.m * k})
      const c = makeFlex(tile, key === "alt" ? "Altitude" : "GroundSpeed", FlexDirection.Column, tileW, tileH, {justify: FlexJustify.Center, align: FlexAlign.Center})
      c.so.getTransform().setLocalPosition(new vec3(0, 0, 0.3))
      addTextRow(c.so, c.flex, key === "alt" ? "AltitudeLabel" : "SpeedLabel", label, "Label", tileW - 1, rowHeight("Label", D), TEXT.secondary, D)
      this.rows[key + "Value"] = addTextRow(c.so, c.flex, key === "alt" ? "AltitudeValue" : "SpeedValue", "38,000", "Display", tileW - 1, rowHeight("Display", D), TEXT.primary, D)
      this.rows[key + "Unit"] = addTextRow(c.so, c.flex, key === "alt" ? "AltitudeUnit" : "SpeedUnit", "FT", "Label", tileW - 1, rowHeight("Label", D), TEXT.secondary, D)
    }
    // Aircraft row: image slot + type name + takeoff/landing. The slot holds the current live side-view model until
    // the aircraft renders (R2) arrive; swap the anchor's child for the render image then.
    const airH = 5.4 * k
    const yAir = -h / 2 + airH / 2
    const slotW = 9.5 * k
    this.imageAnchor = obj(this.infoPane, "AircraftImageAnchor", new vec3(-w / 2 + slotW / 2 + 0.9 * k, yAir - 0.5 * k, 2.0))
    const nameW = w - slotW - 1.9 * k
    const name = makeFlex(this.infoPane, "AircraftName", FlexDirection.Column, nameW, airH, {justify: FlexJustify.Center, align: FlexAlign.Start})
    name.so.getTransform().setLocalPosition(new vec3(-w / 2 + slotW + 1.9 * k + nameW / 2, yAir, 0.02))
    this.rows.typeName = addTextRow(name.so, name.flex, "TypeName", "Airbus A320", "Headline", nameW, rowHeight("Headline", D), TEXT.primary, D, L)
    this.rows.timesLine = addTextRow(name.so, name.flex, "TimesLine", "Takeoff 13:03 · Landing 15:26 UTC", "Label", nameW, rowHeight("Label", D), TEXT.secondary, D, L)
  }

  private buildRoutePane(area: SceneObject, w: number, h: number, D: number): void {
    const k = D / 110
    this.routeW = w
    this.routeH = h
    this.routePane = obj(area, "RoutePane", new vec3(0, 0, 0.02))
    glassPanel(this.routePane, "RouteDiagramGlass", new vec2(w, h), {tint: TILE_TINT, glow: new vec4(0.6, 0.75, 1, 0.1), radiusCm: RADIUS.m * k, edgeCm: 0.08})
    this.map = new RouteMap(this.routePane, this.mapMaterial, w, h, D)
  }

  /** Small chip (airline code / aircraft type or NORAD): deep blue pill, bright edge, white text. */
  private addTag(parent: SceneObject, flex: FlexLayout, name: string, text: string, w: number, D: number): Text {
    const k = D / 110
    const h = rowHeight("Label", D) + 0.3
    const holder = obj(parent, name, new vec3(0, 0, 0.02))
    glassPanel(holder, name + "Glass", new vec2(w * 0.95, h), {radiusCm: h / 2, tint: new vec4(0.07, 0.16, 0.42, 0.75), glow: new vec4(0.6, 0.75, 1, 0.08), edge: PALETTE.glassEdge, edgeCm: 0.07})
    const so = obj(holder, name + "Text", new vec3(0, 0, 0.2))
    const t = so.createComponent("Component.Text") as Text
    t.text = text
    t.font = FONT
    t.depthTest = true
    t.size = roleSize("Label", D)
    ;(t as Text & {weight?: number}).weight = 600
    t.textFill.color = TEXT.primary
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Shrink
    t.layoutRect = Rect.create(-w * 0.44, w * 0.44, -h / 2, h / 2)
    addFlexChild(holder, flex, w, h + 0.2 * k)
    return t
  }

  /**
   * UIKit Button with a transparent (Ghost) fill; the look comes from glass shapes behind it.
   * look: "tab" (segmented; fill + colours handled by applyTabVisuals), "secondary" (outlined pill),
   * "close" (round, filled).
   */
  private makeButton(parent: SceneObject, flex: FlexLayout | null, name: string, label: string, icon: Texture | null, w: number, h: number, D: number, shape: string, onTap: () => void, look: "tab" | "secondary" | "close"): Button {
    const holder = look === "tab" ? parent : obj(parent, name + "Holder", new vec3(0, 0, 0.02))
    if (look === "secondary") {
      glassPanel(holder, name + "Glass", new vec2(w, h), {tint: new vec4(0.08, 0.16, 0.4, 0.55), glow: new vec4(1, 1, 1, 0), edge: PALETTE.glassEdge, edgeCm: 0.1, radiusCm: h / 2})
    } else if (look === "close") {
      glassPanel(holder, name + "Glass", new vec2(w, h), {tint: new vec4(0.3, 0.5, 0.95, 0.65), glow: new vec4(0.8, 0.9, 1, 0.15), edge: PALETTE.glassEdge, edgeCm: 0.12, radiusCm: w / 2})
    }
    const so = obj(holder, name, new vec3(0, 0, 0.1))
    const btn = so.createComponent(Button.getTypeName()) as Button
    btn.setVariant({theme: "SnapOS2", shape: shape, style: "Ghost"})
    btn.size = new vec3(w, h, 1)
    const ec = so.createComponent(ElementContent.getTypeName()) as ElementContent
    applyFontToContent(ec)
    if (label) ec.text = label
    if (icon) {
      ec.leadingIcon = icon
      ec.iconLayout = "left"
      ec.leadingIconSize = Math.min(w, h) * 0.55
    }
    ec.textSize = roleSize(look === "tab" ? "Headline" : "Button", D)
    tintContent(ec, TEXT.primary, TEXT.primary)
    btn.onTriggerUp.add(() => onTap())
    if (flex && look !== "tab") addFlexChild(holder, flex, w, h)
    return btn
  }

  /** Segmented control look: the active tab is filled white with dark text, the inactive one outlined with white text. */
  private applyTabVisuals(): void {
    if (!this.tabVisuals) return
    for (const key of ["route", "info"] as CardTab[]) {
      const v = this.tabVisuals[key]
      const on = this.tab === key
      v.fill.getTransform().setLocalScale(on ? vec3.one() : vec3.zero())
      tintContent(v.ec, on ? TAB_ACTIVE_TEXT : TEXT.primary, TEXT.primary)
    }
  }


  /**
   * Head-local spot: placeDistanceCm straight ahead, centred, aboveEyeDeg up - raised (or shrunk to fit under the
   * top of the display) so the card bottom stays above the menu bar top.
   */
  private placeInFront(dt: number = 0): void {
    const d = this.placeDistanceCm
    const cardH = Math.max(1, this.glass.size.y)
    const half = (Math.atan2(cardH / 2, d) * 180) / Math.PI // half height as seen from the head, deg
    let want = this.aboveEyeDeg
    let fit = 1
    if (this.menuTop) {
      const floor = this.menuTop() + this.menuClearanceDeg
      if (want - half < floor) want = floor + half
      // Keep the top inside the display: if the card is too tall for the space above the menu, shrink it.
      if (!this.camComp) this.camComp = this.cameraObject.getComponent("Component.Camera") as Camera
      const topLimit = this.camComp ? ((this.camComp.fov / 2) * 180) / Math.PI * 0.94 : 15
      if (want + half > topLimit) {
        const room = Math.max(4, topLimit - floor)
        fit = Math.max(0.55, Math.min(1, room / (2 * half)))
        want = floor + half * fit
      }
    }
    const k = dt > 0 ? 1 - Math.exp(-dt * 5) : 1
    this.elevDeg += (want - this.elevDeg) * k
    this.fit += (fit - this.fit) * k
    this.localOffset = new vec3(0, d * Math.tan((this.elevDeg * Math.PI) / 180), -d)
  }

  private applyScale(s: number): void {
    const f = s * this.fit
    this.panelRoot.getTransform().setLocalScale(new vec3(f, f, f))
  }

  /** Replay the recorded snapshot: rewrite the live rows when their text changes (about once a second). */
  private tickLive(): void {
    if (this.tab === "route") {
      this.map.update(getTime() - this.liveStart)
      this.routeProgress = this.map.getProgress()
    }
    const live = this.content?.live
    if (!live) return
    const p = liveProfile(live, getTime() - this.liveStart)
    const set = (k: string, v: string) => {
      if (this.rows[k] && this.rows[k].text !== v) this.rows[k].text = v
    }
    set("originNote", "Departed " + hms(p.departedS) + " ago")
    set("destNote", "Arriving in " + hms(p.arrivingS))
    set("altValue", withCommas(p.altitudeFt))
    set("spdValue", String(Math.round(p.speedKt)))
  }

  private update(): void {
    if (!this.visible || !this.cameraObject) return
    const dt = getDeltaTime()
    this.tickLive()
    this.placeInFront(dt)
    const tr = this.sceneObject.getTransform()
    const ct = this.cameraObject.getTransform()
    const cam = ct.getWorldPosition()
    const target = cam.add(ct.getWorldRotation().multiplyVec3(this.localOffset))
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.dropSeconds)
      const u = 1 - Math.pow(1 - this.t, 3)
      tr.setWorldPosition(vec3.lerp(this.from, target, u))
      this.applyScale(0.35 + 0.65 * u)
      this.following = false
    } else {
      this.applyScale(1)
      const cur = tr.getWorldPosition()
      const kk = 1 - Math.exp((-dt * 4.6) / this.followSeconds)
      tr.setWorldPosition(vec3.lerp(cur, target, kk))
      this.following = cur.distance(target) > 1.5
    }
    const d = cam.sub(tr.getWorldPosition())
    if (d.length > 0.01) tr.setWorldRotation(quat.lookAt(d.normalize(), vec3.up()))
  }
}
