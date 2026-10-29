// SkyHangarRouteMap.ts
// Owns: the simple custom map on the info card's Route tab. Coastline outlines only (thin white lines, no filled
// land) from Assets/Data/coastline.json (Natural Earth 110m, public domain, simplified; bundled, nothing is fetched),
// the route as an arc between the two airports with their codes, and the vehicle as a dot that moves.
// Planes: great-circle arc origin -> destination. Satellites: the ground track for one orbit around now (propagated
// from the TLE with the same two-body model that produced the recorded sub-points). Helicopters: only the path
// already flown (dead-reckoned back along the recorded heading and speed; the recording has no geographic history).
// The map fits the track bounds with a margin. Lines are batched into three meshes (coast, arc ahead, arc flown).
// Plain module, no component. buildTrack() is pure; RouteMap owns the scene objects.

import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {AIRPORTS, SNAPSHOT_UTC, SkyObjectInfo} from "./SkyHangarFlightData"
import {FONT, PALETTE, TEXT, obj, roleSize} from "./SkyHangarSharedUI"

const COAST = requireAsset("../Data/coastline.json") as JsonAsset
const D2R = Math.PI / 180

export interface MapTrack {
  /** The whole line as [lon, lat] points (longitude unwrapped so the line is continuous). */
  pts: vec2[]
  /** Vehicle position along the line (0..1) this many seconds after the card opened. */
  at(elapsedS: number): number
  /** false: draw only what has already been flown (helicopters). */
  showAhead: boolean
  originCode: string
  destCode: string
}

// ---------- track building ----------
function unwrap(pts: vec2[]): vec2[] {
  for (let i = 1; i < pts.length; i++) {
    while (pts[i].x - pts[i - 1].x > 180) pts[i] = new vec2(pts[i].x - 360, pts[i].y)
    while (pts[i].x - pts[i - 1].x < -180) pts[i] = new vec2(pts[i].x + 360, pts[i].y)
  }
  return pts
}

function greatCircle(lat1: number, lon1: number, lat2: number, lon2: number, n: number): vec2[] {
  const la1 = lat1 * D2R, lo1 = lon1 * D2R, la2 = lat2 * D2R, lo2 = lon2 * D2R
  const dd = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((la2 - la1) / 2), 2) + Math.cos(la1) * Math.cos(la2) * Math.pow(Math.sin((lo2 - lo1) / 2), 2)))
  const out: vec2[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const A = Math.sin((1 - t) * dd) / Math.sin(dd), B = Math.sin(t * dd) / Math.sin(dd)
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2)
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2)
    const z = A * Math.sin(la1) + B * Math.sin(la2)
    out.push(new vec2(Math.atan2(y, x) / D2R, Math.atan2(z, Math.sqrt(x * x + y * y)) / D2R))
  }
  return unwrap(out)
}

function gmstDeg(ms: number): number {
  const d = ms / 86400000 + 2440587.5 - 2451545.0
  return (((280.46061837 + 360.98564736629 * d) % 360) + 360) % 360
}

/** Sub-satellite [lon, lat] at time `ms` from a TLE (two-body Kepler, no perturbations). */
function tleSubpoint(tle: string[], ms: number): vec2 {
  const l1 = tle[0], l2 = tle[1]
  const epoch = Date.UTC(2000 + parseInt(l1.substr(18, 2), 10), 0, 1) + (parseFloat(l1.substr(20, 12)) - 1) * 86400000
  const inc = parseFloat(l2.substr(8, 8)) * D2R
  const raan = parseFloat(l2.substr(17, 8)) * D2R
  const ecc = parseFloat("0." + l2.substr(26, 7).trim())
  const argp = parseFloat(l2.substr(34, 8)) * D2R
  const m0 = parseFloat(l2.substr(43, 8)) * D2R
  const revPerDay = parseFloat(l2.substr(52, 11))
  const m = m0 + revPerDay * 2 * Math.PI * ((ms - epoch) / 86400000)
  let e = m
  for (let i = 0; i < 6; i++) e = m + ecc * Math.sin(e)
  const nu = 2 * Math.atan2(Math.sqrt(1 + ecc) * Math.sin(e / 2), Math.sqrt(1 - ecc) * Math.cos(e / 2))
  const u = argp + nu
  const lat = Math.asin(Math.sin(inc) * Math.sin(u)) / D2R
  let lon = (raan + Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u))) / D2R - gmstDeg(ms)
  lon = (((lon + 540) % 360) + 360) % 360 - 180
  return new vec2(lon, lat)
}

export function buildTrack(info: SkyObjectInfo): MapTrack {
  const o = AIRPORTS[info.origin]
  const d = AIRPORTS[info.destination]
  if (info.kind === "plane" && o && d) {
    const pts = greatCircle(o.lat, o.lon, d.lat, d.lon, 48)
    const total = Math.max(1, (info.departedAgoMin + info.arrivingInMin) * 60)
    return {pts, at: (el) => Math.max(0, Math.min(1, (info.departedAgoMin * 60 + el) / total)), showAhead: true, originCode: info.origin, destCode: info.destination}
  }
  if (info.kind === "satellite" && info.tle && info.tle.length >= 2) {
    const periodS = 86400 / parseFloat(info.tle[1].substr(52, 11))
    const t0 = Date.parse(SNAPSHOT_UTC)
    const pts: vec2[] = []
    for (let i = 0; i <= 60; i++) pts.push(tleSubpoint(info.tle, t0 + (i / 60 - 0.5) * periodS * 1000))
    return {pts: unwrap(pts), at: (el) => Math.max(0, Math.min(1, 0.5 + el / periodS)), showAhead: true, originCode: "", destCode: ""}
  }
  // Helicopter (or a plane without airport data): dead-reckon the flown path back along heading and speed.
  const PAST_MIN = 15
  const kmPerMin = (info.speedKt * 1.852) / 60
  const hdg = info.trackDeg * D2R
  const cosLat = Math.max(0.2, Math.cos(info.lat * D2R))
  const pts: vec2[] = []
  for (let i = 0; i <= PAST_MIN; i++) {
    const km = (i - PAST_MIN) * kmPerMin
    pts.push(new vec2(info.lon + (km * Math.sin(hdg)) / (111.2 * cosLat), info.lat + (km * Math.cos(hdg)) / 111.2))
  }
  // The path ends at the helicopter, so the dot stays on the last point.
  return {pts, at: () => 1, showAhead: false, originCode: "", destCode: ""}
}

// ---------- geometry helpers ----------
function pointAt(pts: vec2[], f: number): vec2 {
  const x = Math.max(0, Math.min(1, f)) * (pts.length - 1)
  const i = Math.min(pts.length - 2, Math.floor(x))
  const t = x - i
  return new vec2(pts[i].x + (pts[i + 1].x - pts[i].x) * t, pts[i].y + (pts[i + 1].y - pts[i].y) * t)
}

/** Liang-Barsky clip of segment a-b to |x| <= hx, |y| <= hy; null when fully outside. */
function clipSeg(a: vec2, b: vec2, hx: number, hy: number): [vec2, vec2] | null {
  let t0 = 0, t1 = 1
  const dx = b.x - a.x, dy = b.y - a.y
  const edges: [number, number][] = [[-dx, a.x + hx], [dx, hx - a.x], [-dy, a.y + hy], [dy, hy - a.y]]
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return null
    } else {
      const r = q / p
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r }
      else { if (r < t0) return null; if (r < t1) t1 = r }
    }
  }
  return [new vec2(a.x + dx * t0, a.y + dy * t0), new vec2(a.x + dx * t1, a.y + dy * t1)]
}

class Strokes {
  verts: number[] = []
  idx: number[] = []
  /** One flat quad per segment, extended by the half width at both ends so joints stay closed. */
  add(a: vec2, b: vec2, hw: number): void {
    const dx = b.x - a.x, dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-4) return
    const ux = dx / len, uy = dy / len
    const nx = -uy * hw, ny = ux * hw
    const ax = a.x - ux * hw, ay = a.y - uy * hw, bx = b.x + ux * hw, by = b.y + uy * hw
    const base = this.verts.length / 5
    this.verts.push(ax + nx, ay + ny, 0, 0, 0, ax - nx, ay - ny, 0, 0, 0, bx - nx, by - ny, 0, 0, 0, bx + nx, by + ny, 0, 0, 0)
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  get empty(): boolean { return this.idx.length === 0 }
  mesh(): RenderMesh {
    const b = new MeshBuilder([{name: "position", components: 3}, {name: "texture0", components: 2}])
    b.topology = MeshTopology.Triangles
    b.indexType = MeshIndexType.UInt16
    b.appendVerticesInterleaved(this.verts)
    b.appendIndices(this.idx)
    b.updateMesh()
    return b.getMesh()
  }
}

// ---------- scene objects ----------
interface Layer {
  so: SceneObject
  rmv: RenderMeshVisual
}

export class RouteMap {
  private coast: Layer
  private ahead: Layer
  private done: Layer
  private originDot: SceneObject
  private destDot: SceneObject
  private halo: SceneObject
  private dot: SceneObject
  private codes: Text[] = []
  private track: MapTrack | null = null
  private cLon = 0
  private cLat = 0
  private cosL = 1
  private scale = 1
  private progress = 0
  private lastBuiltEl = -1e9
  private readonly w: number
  private readonly h: number
  private readonly hx: number
  private readonly hy: number

  constructor(parent: SceneObject, material: Material, w: number, h: number, private readonly D: number) {
    this.w = w
    this.h = h
    this.hx = w / 2 - 0.6
    this.hy = h / 2 - 0.6
    const root = obj(parent, "RouteMap", new vec3(0, 0, 0.3))
    const layer = (name: string, z: number, color: vec4): Layer => {
      const so = obj(root, name, new vec3(0, 0, z))
      const rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
      const m = material.clone()
      m.mainPass.baseColor = color
      m.mainPass.twoSided = true
      rmv.mainMaterial = m
      so.enabled = false
      return {so, rmv}
    }
    this.coast = layer("MapCoastline", 0, new vec4(1, 1, 1, 0.5))
    this.ahead = layer("MapRouteAhead", 0.05, new vec4(1, 1, 1, 0.55))
    this.done = layer("MapRouteFlown", 0.1, new vec4(1, 1, 1, 1))
    const k = D / 110
    const disc = (name: string, size: number, fill: vec4, border: vec4 | null, z: number): SceneObject => {
      const so = obj(root, name, new vec3(0, 0, z))
      const r = so.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
      r.initialize()
      r.size = new vec2(size, size)
      r.cornerRadius = size / 2
      r.backgroundColor = fill
      if (border) {
        r.border = true
        r.borderSize = 0.1
        r.borderColor = border
      }
      return so
    }
    this.originDot = disc("MapOriginDot", 1.2 * k, TEXT.primary, PALETTE.accent, 0.2)
    this.destDot = disc("MapDestDot", 1.2 * k, TEXT.primary, PALETTE.accent, 0.2)
    this.halo = disc("MapVehicleHalo", 2.8 * k, new vec4(PALETTE.accent.x, PALETTE.accent.y, PALETTE.accent.z, 0.4), null, 0.25)
    this.dot = disc("MapVehicleDot", 1.5 * k, TEXT.primary, PALETTE.accent, 0.3)
    for (const nm of ["MapOriginCode", "MapDestCode"]) {
      const so = obj(root, nm, new vec3(0, 0, 0.2))
      const t = so.createComponent("Component.Text") as Text
      t.text = ""
      t.font = FONT
      t.depthTest = true
      t.size = roleSize("Body", D)
      ;(t as Text & {weight?: number}).weight = 600
      t.textFill.color = TEXT.primary
      t.horizontalAlignment = HorizontalAlignment.Center
      t.verticalAlignment = VerticalAlignment.Center
      t.horizontalOverflow = HorizontalOverflow.Overflow
      t.layoutRect = Rect.create(-3, 3, -0.8, 0.8)
      this.codes.push(t)
    }
  }

  getProgress(): number { return this.progress }

  /** Fit the map to the track (with a margin), then draw the coastline, route and dot. */
  show(track: MapTrack, elapsedS: number = 0): void {
    this.track = track
    let minLon = 1e9, maxLon = -1e9, minLat = 1e9, maxLat = -1e9
    for (const p of track.pts) {
      minLon = Math.min(minLon, p.x); maxLon = Math.max(maxLon, p.x)
      minLat = Math.min(minLat, p.y); maxLat = Math.max(maxLat, p.y)
    }
    this.cLon = (minLon + maxLon) / 2
    this.cLat = (minLat + maxLat) / 2
    this.cosL = Math.max(0.25, Math.cos(this.cLat * D2R))
    const spanX = Math.max(0.8, (maxLon - minLon) * this.cosL)
    const spanY = Math.max(0.4, maxLat - minLat)
    const mx = Math.max(2.5, this.w * 0.1)
    const my = 2.6 // room for the airport codes under their dots
    this.scale = Math.min((this.w - 2 * mx) / spanX, (this.h - 2 * my) / spanY)
    this.buildCoast()
    const o = this.proj(track.pts[0])
    const e = this.proj(track.pts[track.pts.length - 1])
    const hasEnds = track.originCode !== ""
    for (const [so, p] of [[this.originDot, o], [this.destDot, e]] as [SceneObject, vec2][]) {
      so.enabled = hasEnds
      so.getTransform().setLocalPosition(new vec3(p.x, p.y, 0.2))
    }
    const place = (t: Text, p: vec2, s: string) => {
      t.text = s
      t.getSceneObject().getTransform().setLocalPosition(new vec3(p.x, Math.max(-this.h / 2 + 1.2, p.y - 1.8), 0.2))
    }
    place(this.codes[0], o, track.originCode)
    place(this.codes[1], e, track.destCode)
    this.lastBuiltEl = -1e9
    this.update(elapsedS)
  }

  /** Move the dot (every frame) and redraw the flown / ahead lines (about once a second). */
  update(elapsedS: number): void {
    const tr = this.track
    if (!tr) return
    const f = tr.at(elapsedS)
    this.progress = f
    const p = this.proj(pointAt(tr.pts, f))
    this.dot.getTransform().setLocalPosition(new vec3(p.x, p.y, 0.3))
    this.halo.getTransform().setLocalPosition(new vec3(p.x, p.y, 0.25))
    if (elapsedS - this.lastBuiltEl < 1) return
    this.lastBuiltEl = elapsedS
    const pts = tr.pts.map((q) => this.proj(q))
    const n = pts.length - 1
    const x = f * n
    const i = Math.min(n - 1, Math.floor(x))
    const flown = pts.slice(0, i + 1).concat([p])
    const rest = [p].concat(pts.slice(i + 1))
    this.fill(this.done, flown, 0.14)
    if (tr.showAhead) this.fill(this.ahead, rest, 0.08)
    else this.ahead.so.enabled = false
  }

  private proj(p: vec2): vec2 {
    return new vec2((p.x - this.cLon) * this.cosL * this.scale, (p.y - this.cLat) * this.scale)
  }

  private fill(layer: Layer, line: vec2[], hw: number): void {
    const s = new Strokes()
    for (let i = 0; i + 1 < line.length; i++) {
      const c = clipSeg(line[i], line[i + 1], this.hx, this.hy)
      if (c) s.add(c[0], c[1], hw)
    }
    layer.so.enabled = !s.empty
    if (!s.empty) layer.rmv.mesh = s.mesh()
  }

  private buildCoast(): void {
    const data = JSON.parse(COAST.getString()) as {lines: number[][]}
    const s = new Strokes()
    const minStep = 0.12 // cm: drop points closer than this so the batch stays small
    for (const off of [-360, 0, 360]) {
      for (const flat of data.lines) {
        let last: vec2 | null = null
        for (let i = 0; i < flat.length; i += 2) {
          const p = this.proj(new vec2(flat[i] + off, flat[i + 1]))
          const end = i + 2 >= flat.length
          if (last && !end && p.distance(last) < minStep) continue
          if (last) {
            const c = clipSeg(last, p, this.hx, this.hy)
            if (c) s.add(c[0], c[1], 0.05)
          }
          last = p
        }
      }
    }
    this.coast.so.enabled = !s.empty
    if (!s.empty) this.coast.rmv.mesh = s.mesh()
  }
}
