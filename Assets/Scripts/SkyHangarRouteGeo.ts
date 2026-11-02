// SkyHangarRouteGeo.ts
// Owns: sky routes from real geography. A plane's route is the great circle between its origin and destination
// airports (Earth-scale sphere, cruise altitude with a climb / descent ramp), converted to the observer's sky
// (azimuth / elevation) and cut where it dips below the horizon. Satellites march their orbit arc to the horizon.
// Passive maths: no scene objects. Data per vehicle type: planes have origin + destination airports (AIRPORTS table)
// plus one snapshot position; helicopters and satellites have a snapshot position + heading and a recorded past path only.

import {AIRPORTS, SKY_OBJECTS, SkyObjectInfo} from "./SkyHangarFlightData"
import {DEG, skyDir} from "./SkyHangarUtil"

const R_KM = 6371
const CRUISE_KM = 11 // cruise altitude
const CLIMB_SLOPE = 0.06 // altitude gained per km flown away from an airport (about 3.4 degrees)
const GROUND_REF_KM = 1 // below this altitude the point is pulled down toward the ground line
const HORIZON_DIP_DEG = -3 // routes continue this far below the horizon, then end (faded out)
// Stand-in sky (the recorded sky elevations are not physical): elevation = SKY_EL0 - SKY_EL_PER_KM * ground distance,
// fitted to the recorded snapshot, so the horizon sits about 92 km out.
const SKY_EL0 = 68
const SKY_EL_PER_KM = 0.737
const SAMPLES = 720

export interface PlaneRoute {
  dirs: vec3[] // unit sky directions, origin side -> destination side
  planeIndex: number // sample nearest the recorded plane position
  startOnGround: boolean // the route begins at its origin airport on the ground line
  endOnGround: boolean // the route ends at its destination airport on the ground line
}

function unit(latDeg: number, lonDeg: number): vec3 {
  const p = latDeg * DEG
  const l = lonDeg * DEG
  return new vec3(Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p))
}
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const smooth01 = (v: number) => {
  const x = clampN(v, 0, 1)
  return x * x * (3 - 2 * x)
}
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180

let observerCache: {lat: number; lon: number} | null = null
/** The observer's ground position, recovered from the recorded (position, distance, azimuth) of the nearby aircraft. */
export function getObserver(): {lat: number; lon: number} {
  if (observerCache) return observerCache
  let sl = 0
  let sn = 0
  let n = 0
  for (const o of SKY_OBJECTS) {
    if (o.kind === "satellite" || o.distanceKm > 100) continue
    const th = (o.azimuthDeg + 180) * DEG
    const dl = o.distanceKm / R_KM
    const p1 = o.lat * DEG
    const p2 = Math.asin(Math.sin(p1) * Math.cos(dl) + Math.cos(p1) * Math.sin(dl) * Math.cos(th))
    const l2 = o.lon * DEG + Math.atan2(Math.sin(th) * Math.sin(dl) * Math.cos(p1), Math.cos(dl) - Math.sin(p1) * Math.sin(p2))
    sl += p2
    sn += l2
    n++
  }
  observerCache = n > 0 ? {lat: sl / n / DEG, lon: sn / n / DEG} : {lat: 51.51, lon: -0.3}
  return observerCache
}

/** Great-circle route origin -> destination in the observer's sky, or null when airports are unknown / nothing is visible. */
export function buildPlaneRoute(info: SkyObjectInfo): PlaneRoute | null {
  const A = AIRPORTS[info.origin]
  const B = AIRPORTS[info.destination]
  if (!A || !B) return null
  const ob = getObserver()
  const u0 = unit(ob.lat, ob.lon)
  const lam = ob.lon * DEG
  const phi = ob.lat * DEG
  const east = new vec3(-Math.sin(lam), Math.cos(lam), 0)
  const north = new vec3(-Math.sin(phi) * Math.cos(lam), -Math.sin(phi) * Math.sin(lam), Math.cos(phi))
  const a = unit(A.lat, A.lon)
  const b = unit(B.lat, B.lon)
  const omega = Math.acos(clampN(a.dot(b), -1, 1))
  if (omega < 1e-4) return null
  const total = omega * R_KM
  const so = Math.sin(omega)

  const at = (sKm: number) => {
    const t = sKm / total
    const p = a.uniformScale(Math.sin((1 - t) * omega) / so).add(b.uniformScale(Math.sin(t * omega) / so))
    const d = Math.acos(clampN(p.dot(u0), -1, 1)) * R_KM
    let az = Math.atan2(p.dot(east), p.dot(north)) / DEG
    if (az < 0) az += 360
    const h = Math.min(CRUISE_KM, CLIMB_SLOPE * Math.min(sKm, total - sKm))
    const el = (SKY_EL0 - SKY_EL_PER_KM * d) * Math.min(1, h / GROUND_REF_KM)
    return {az, el, d}
  }
  const ok = (sKm: number) => at(sKm).el >= HORIZON_DIP_DEG

  // Closest approach to the observer, then walk both ways until the line dips below the horizon (or reaches an airport).
  const step = Math.max(2, total / 4000)
  let sMin = 0
  let dMin = 1e9
  for (let s = 0; s <= total; s += step) {
    const d = at(s).d
    if (d < dMin) { dMin = d; sMin = s }
  }
  if (!ok(sMin)) return null
  let sL = sMin
  let startOnGround = false
  for (;;) {
    if (sL <= 0) { sL = 0; startOnGround = true; break }
    const nx = Math.max(0, sL - step)
    if (ok(nx)) { sL = nx; continue }
    let lo = nx
    let hi = sL
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2
      if (ok(mid)) hi = mid
      else lo = mid
    }
    sL = hi
    break
  }
  let sR = sMin
  let endOnGround = false
  for (;;) {
    if (sR >= total) { sR = total; endOnGround = true; break }
    const nx = Math.min(total, sR + step)
    if (ok(nx)) { sR = nx; continue }
    let lo = sR
    let hi = nx
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2
      if (ok(mid)) lo = mid
      else hi = mid
    }
    sR = lo
    break
  }

  const az: number[] = []
  const el: number[] = []
  for (let k = 0; k <= SAMPLES; k++) {
    const p = at(sL + ((sR - sL) * k) / SAMPLES)
    az.push(p.az)
    el.push(p.el)
  }

  // The recorded sky position is a stand-in, so pull the route onto it: the offset at the nearest point is blended in
  // with a weight that falls to zero at the horizon (ends keep their true horizon crossing).
  const Dp = skyDir(info.skyAzimuthDeg, info.skyElevationDeg)
  const nearest = (): number => {
    let best = 0
    let bd = -2
    for (let i = 0; i < az.length; i++) {
      const d = skyDir(az[i], el[i]).dot(Dp)
      if (d > bd) { bd = d; best = i }
    }
    return best
  }
  const i0 = nearest()
  const dAz = wrap180(info.skyAzimuthDeg - az[i0])
  const dEl = info.skyElevationDeg - el[i0]
  const elp = Math.max(5, info.skyElevationDeg)
  for (let i = 0; i < az.length; i++) {
    const w = smooth01(el[i] / elp)
    az[i] += w * dAz
    el[i] += w * dEl
  }
  const dirs: vec3[] = []
  for (let i = 0; i < az.length; i++) dirs.push(skyDir(az[i], el[i]))
  return {dirs, planeIndex: nearest(), startOnGround, endOnGround}
}

/** How far (radians) a great circle through dir along tangent runs back / ahead before dipping below the horizon. */
export function horizonSpan(dir: vec3, tangent: vec3): {back: number; ahead: number} {
  const t = tangent.sub(dir.uniformScale(tangent.dot(dir))).normalize()
  const limit = Math.sin(HORIZON_DIP_DEG * DEG)
  const march = (sign: number): number => {
    for (let a = 0.5 * DEG; a < 180 * DEG; a += 0.5 * DEG) {
      const y = dir.y * Math.cos(a) + sign * t.y * Math.sin(a)
      if (y < limit) return a
    }
    return 180 * DEG
  }
  return {back: march(-1), ahead: march(1)}
}

// ---------- helicopters: the recorded track ----------

/** A recorded track with fewer points than this is too short to trust as a path: it is drawn as-is (no spline). */
export const MIN_TRACK_POINTS = 6
/** Assumed spacing of the recorded samples; with the ground speed it gives the track's real-world length for the map. */
const TRACK_SAMPLE_S = 5

/** Catmull-Rom through the path points, re-projected onto the unit sphere: a smooth dense curve. */
export function smoothPath(pts: vec3[]): vec3[] {
  const n = pts.length
  if (n < 3) return pts.slice()
  const out: vec3[] = []
  const sub = 6
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)]
    for (let s = 0; s < sub; s++) {
      const t = s / sub, t2 = t * t, t3 = t2 * t
      const c = (a: number, b: number, cc: number, d: number) =>
        0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3)
      out.push(new vec3(c(p0.x, p1.x, p2.x, p3.x), c(p0.y, p1.y, p2.y, p3.y), c(p0.z, p1.z, p2.z, p3.z)).normalize())
    }
  }
  out.push(pts[n - 1].normalize())
  return out
}

export interface HeliTrack {
  dirs: vec3[] // the flown path on the sky: unit directions, oldest -> the helicopter (smooth spline unless sparse)
  km: vec2[] // the same path on the ground, east / north in km (the same curve as the sky path)
  recorded: number // number of recorded points
  sparse: boolean // too few points for a real path: the short recorded segment is shown as it is
}

/** The helicopter's flown path from its recorded points (null with fewer than 2). Nothing is invented. */
export function heliTrack(info: SkyObjectInfo): HeliTrack | null {
  const raw = (info.skyPathPast || []).map((p) => skyDir(p[0], p[1]))
  const n = raw.length
  if (n < 2) return null
  const sparse = n < MIN_TRACK_POINTS
  let dirs = raw
  if (!sparse) {
    // One light pass over the interior points takes the sample jitter out, then a spline for the gentle natural curve.
    const sm = raw.map((p, i) => (i === 0 || i === n - 1 ? p : raw[i - 1].uniformScale(0.25).add(p.uniformScale(0.5)).add(raw[i + 1].uniformScale(0.25)).normalize()))
    dirs = smoothPath(sm)
  }
  // Ground position of each sky point with the same stand-in sky <-> ground relation the plane routes use
  // (bearing = azimuth, ground distance from the elevation), then scaled to the real length of the track.
  const enu = dirs.map((d) => {
    const az = Math.atan2(d.x, -d.z)
    const el = Math.asin(Math.max(-1, Math.min(1, d.y))) / DEG
    const dist = Math.max(0, (SKY_EL0 - el) / SKY_EL_PER_KM)
    return new vec2(dist * Math.sin(az), dist * Math.cos(az))
  })
  let len = 0
  for (let i = 1; i < enu.length; i++) len += enu[i].distance(enu[i - 1])
  const target = ((info.speedKt * 1.852) / 3600) * TRACK_SAMPLE_S * (n - 1)
  const k = len > 1e-6 ? target / len : 1
  return {dirs, km: enu.map((p) => new vec2(p.x * k, p.y * k)), recorded: n, sparse}
}
