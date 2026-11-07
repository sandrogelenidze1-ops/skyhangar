// SkyHangarBirds.ts
// Owns: small far-away birds that fly by now and then. Each of the four slots waits a random 20-60 s, then a single bird (55%) or a small flock of 2-3 flies a gentle curved
// path across the sky for 8-15 s, 12-48 degrees above the horizon, 24-50 m away (behind every marker, trail and UI), and is gone again (usually 1-2 birds out, never more than 12).
// Plus 8 EXTRA birds: every 10-25 s a random event sends 1-3 of them across the sky (7-12 s, wide 80-180 degree sweeps, different heights, distances and directions).
// A bird shrinks away while it is within ~22-32 degrees of where the user looks, so it never covers the centre of view or the info card.
// A bird is a V of two flat wings (one shared tiny mesh, mirrored) plus a small body: a dark charcoal silhouette by day (#1A1F2B) and a very dark grey-blue at night (#2A3140; pure black is see-through on the additive display).
// Not selectable (no collider, no Interactable, not in SKY_OBJECTS, so no aim, pin or radar blip), unlit and opaque, depth-tested BEHIND the markers.
// Per-frame cost: nothing while no bird is out; with one bird out, three transform writes. Driven by SkyHangarSkyController.update(); lives under its root, which follows the camera.
// Must not: draw text, take input or touch the markers.

import {makeObj, skyDir, DEG} from "./SkyHangarUtil"

const BIRD_DIST_CM = 3600 // reference distance (the bird size is authored here)
const DIST_MIN = 2400, DIST_MAX = 5000 // flights happen at different distances (small birds: 60 cm wing span, about 0.7-1.4 degrees)
const SLOTS = 4 // flocks / single birds that can be out at once (about twice the former three single birds' share of the sky: ~1.5 birds out on average)
const MAX_FLOCK = 3
const EXTRA_BIRDS = 8 // extra birds, sent across the sky by random events (at most this many exist at once)
const EVENT_FIRST = 3, EVENT_PERIOD = 9 // seconds: the first event, then exactly one event every 9 s, each sending 1-3 of the extra birds across the view
const EL_MIN = 12, EL_MAX = 48 // altitudes, degrees above the horizon: never near the horizon line at the centre of view
const CENTRE_NEAR_DEG = 6, CENTRE_FAR_DEG = 10 // a bird shrinks away while it is within this angle of where the user looks (and is gone inside the near angle)
const BIRD_ORDER = -60 // far behind the markers (10), trails (4/5) and the UI
const SPAN_CM = 60 // wing tip to wing tip
const FLAP_HZ = 5.5
const FLAP_RAD = 0.42
const MIN_WAIT = 20
const MAX_WAIT = 60
const MIN_FLY = 8
const MAX_FLY = 15
const FADE_S = 0.8
export const BIRD_DAY = [0x1a / 255, 0x1f / 255, 0x2b / 255] // charcoal, opaque, unlit: nothing tints, blends or brightens it
export const BIRD_NIGHT = [0x2a / 255, 0x31 / 255, 0x40 / 255]
/** Bird colour for a Time of Day 0 (day) .. 1 (night): day colour until dusk, then easing to the night colour. */
export function birdColor(tod: number): vec4 {
  const t = Math.max(0, Math.min(1, (tod - 0.35) / 0.4))
  const n = t * t * (3 - 2 * t)
  return new vec4(BIRD_DAY[0] + (BIRD_NIGHT[0] - BIRD_DAY[0]) * n, BIRD_DAY[1] + (BIRD_NIGHT[1] - BIRD_DAY[1]) * n, BIRD_DAY[2] + (BIRD_NIGHT[2] - BIRD_DAY[2]) * n, 1)
}

interface Rig {
  root: SceneObject
  left: SceneObject
  right: SceneObject
  off: vec3 // offset inside the flock (flock-local, unscaled cm; -z is forward)
  phase: number
}

interface Slot {
  root: SceneObject // the flock: moves along the path
  rigs: Rig[] // up to MAX_FLOCK birds; the first `n` fly
  n: number
  extra: boolean // one of the event-driven extra birds (never starts on its own)
  dist: number // distance of this flight, cm
  wait: number // seconds until the next flight (while idle)
  t: number // seconds into the flight (-1 = idle)
  dur: number
  az0: number
  az1: number
  el0: number
  el1: number
  elMid: number
  phase: number
}

function tinyMesh(verts: number[][], tris: number[][]): RenderMesh {
  const b = new MeshBuilder([
    {name: "position", components: 3},
    {name: "normal", components: 3, normalized: true},
    {name: "texture0", components: 2}
  ])
  b.topology = MeshTopology.Triangles
  b.indexType = MeshIndexType.UInt16
  const v: number[] = []
  for (const p of verts) v.push(p[0], p[1], p[2], 0, 1, 0, 0, 0)
  b.appendVerticesInterleaved(v)
  const idx: number[] = []
  for (const t of tris) idx.push(t[0], t[1], t[2])
  b.appendIndices(idx)
  b.updateMesh()
  return b.getMesh()
}

export class SkyHangarBirds {
  private slots: Slot[] = []
  private root: SceneObject
  private rnd: () => number
  private mat: Material
  private todSource: any = null
  private todClock = 0
  active = 0
  private eventWait = EVENT_FIRST // seconds until the next extra-bird event
  private gazeEl = 0 // elevation the user is looking at, degrees
  private gazeAz = 0 // compass azimuth the user is looking at (head yaw), degrees

  constructor(parent: SceneObject, unlit: Material, seed: number = 4242) {
    let s = seed
    this.rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    this.root = makeObj(parent, "Birds")
    const mat = unlit.clone()
    mat.mainPass.baseColor = birdColor(0)
    this.mat = mat
    mat.mainPass.blendMode = BlendMode.Disabled
    mat.mainPass.twoSided = true
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    // wing in local space: hinge along z at x = 0, tip at +x (unit length); swept back a little. The left wing is the same mesh mirrored.
    const wing = tinyMesh([[0, 0, -0.18], [1, 0, 0.05], [0.8, 0, 0.26], [0, 0, 0.3]], [[0, 1, 2], [0, 2, 3]])
    // body: a slim diamond along the flight direction (-z is forward)
    const body = tinyMesh([[0, 0, -0.34], [0.07, 0, 0], [0, 0, 0.3], [-0.07, 0, 0]], [[0, 1, 2], [0, 2, 3]])
    for (let i = 0; i < SLOTS + EXTRA_BIRDS; i++) {
      const extra = i >= SLOTS
      const flock = makeObj(this.root, extra ? "Extra" + (i - SLOTS) : "Flock" + i)
      const rigs: Rig[] = []
      for (let j = 0; j < (extra ? 1 : MAX_FLOCK); j++) {
        const root = makeObj(flock, "Bird" + j)
        const mk = (name: string, mesh: RenderMesh): SceneObject => {
          const o = makeObj(root, name)
          const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
          rmv.mesh = mesh
          rmv.mainMaterial = mat
          rmv.setRenderOrder(BIRD_ORDER)
          return o
        }
        const left = mk("WingL", wing)
        const right = mk("WingR", wing)
        const body0 = mk("Body", body)
        left.getTransform().setLocalScale(new vec3(-SPAN_CM / 2, SPAN_CM / 2, SPAN_CM / 2))
        right.getTransform().setLocalScale(new vec3(SPAN_CM / 2, SPAN_CM / 2, SPAN_CM / 2))
        body0.getTransform().setLocalScale(new vec3(SPAN_CM / 2, SPAN_CM / 2, SPAN_CM / 2))
        rigs.push({root, left, right, off: vec3.zero(), phase: 0})
      }
      flock.enabled = false
      this.slots.push({root: flock, rigs, n: 1, extra, dist: BIRD_DIST_CM, wait: extra ? 1e9 : 5 + this.rnd() * 35, t: -1, dur: 10, az0: 0, az1: 0, el0: 0, el1: 0, elMid: 0, phase: 0})
    }
  }

  /** Event birds out right now (at most EXTRA_BIRDS). */
  get extraCount(): number { return this.slots.reduce((a, s) => a + (s.extra && s.t >= 0 ? 1 : 0), 0) }

  /** Birds out right now (a flock counts every bird). */
  get birdCount(): number { return this.slots.reduce((a, s) => a + (s.t >= 0 ? s.n : 0), 0) }

  private lerp(a: number, b: number, k: number): number { return a + (b - a) * k }

  private start(sl: Slot): void {
    const r = this.rnd
    sl.t = 0
    sl.dur = sl.extra ? 5 + r() * 2 : MIN_FLY + r() * (MAX_FLY - MIN_FLY)
    if (sl.extra) {
      // event birds start on one side of where the user looks (head yaw) and fly across the view to the other side: always in front, never behind
      const side = r() < 0.5 ? -1 : 1
      sl.az0 = this.gazeAz + side * (22 + r() * 8)
      sl.az1 = this.gazeAz - side * (18 + r() * 10)
      const base = this.gazeEl + 10 // inside the view: 10-20 degrees above where the user looks, and always 15-40 above the horizon
      sl.el0 = Math.max(15, Math.min(40, base + r() * 10))
      sl.el1 = Math.max(15, Math.min(40, base + r() * 10))
    } else {
      sl.az0 = r() * 360
      sl.az1 = sl.az0 + (r() < 0.5 ? -1 : 1) * (60 + r() * 80) // a sweep of 60-140 degrees
      sl.el0 = EL_MIN + r() * (EL_MAX - EL_MIN)
      sl.el1 = EL_MIN + r() * (EL_MAX - EL_MIN)
    }
    sl.elMid = Math.max(EL_MIN, Math.min(EL_MAX, (sl.el0 + sl.el1) / 2 + (r() - 0.5) * 12)) // a gentle rise or dip in the middle
    sl.phase = r() * 6.28
    sl.dist = DIST_MIN + r() * (DIST_MAX - DIST_MIN)
    const q = r()
    sl.n = sl.extra || q < 0.55 ? 1 : q < 0.85 ? 2 : 3 // mostly single birds, sometimes a small flock
    sl.rigs.forEach((g, j) => {
      g.root.enabled = j < sl.n
      g.phase = r() * 6.28
      // a loose V behind the leader: wingmen trail back and to the sides, a little up or down
      const side = j === 0 ? 0 : (j % 2 === 1 ? 1 : -1) * (80 + 60 * r())
      g.off = new vec3(side, (r() - 0.5) * 50, j === 0 ? 0 : 70 * j + 40 * r())
      g.root.getTransform().setLocalPosition(g.off)
    })
    sl.root.enabled = true
    this.active++
    const p0 = this.dirAt(sl, 0).uniformScale(sl.dist)
    print("[BIRD] spawn " + (sl.extra ? "event" : "regular") + " n=" + sl.n + " pos(" + p0.x.toFixed(0) + "," + p0.y.toFixed(0) + "," + p0.z.toFixed(0) + ") az " + sl.az0.toFixed(0) + "->" + sl.az1.toFixed(0) + " (gaze az " + this.gazeAz.toFixed(0) + " el " + this.gazeEl.toFixed(0) + ") el " + sl.el0.toFixed(0) + " dist " + sl.dist.toFixed(0) + " cm, " + (SPAN_CM / sl.dist / DEG).toFixed(1) + " deg wide, " + sl.dur.toFixed(1) + " s") // temporary
  }

  /** Sky direction (unit) of a slot at flight fraction k: a smooth quadratic curve through azimuth / elevation, always above the horizon. */
  private dirAt(sl: Slot, k: number): vec3 {
    const u = 1 - k
    const az = sl.az0 + (sl.az1 - sl.az0) * k + 9 * Math.sin(k * Math.PI * 2) // a lazy S-bend on top of the sweep
    const el = u * u * sl.el0 + 2 * u * k * sl.elMid + k * k * sl.el1
    return skyDir(az, Math.max(EL_MIN, el))
  }

  /** World-space directions' positions (local to the sky root) of the birds currently out. For tests. */
  activePositions(): vec3[] {
    const out: vec3[] = []
    for (const sl of this.slots) if (sl.t >= 0) out.push(sl.root.getTransform().getLocalPosition())
    return out
  }

  /** Test hook: the bird objects (to check they have no collider or interactable). */
  getBirdObjects(): SceneObject[] { return this.slots.map((s) => s.root) }

  /** Time of Day lives on the sky script under PreviewBackdrop (a `timeOfDay` field); looked up about once a second, only while a bird is out. */
  private readTod(): number {
    if (!this.todSource) {
      const find = (o: SceneObject): SceneObject | null => {
        if (o.name === "PreviewBackdrop") return o
        for (let i = 0; i < o.getChildrenCount(); i++) { const r = find(o.getChild(i)); if (r) return r }
        return null
      }
      for (let i = 0; i < global.scene.getRootObjectsCount() && !this.todSource; i++) {
        const pb = find(global.scene.getRootObject(i))
        if (pb) for (const c of pb.getComponents("Component.ScriptComponent")) if (typeof (c as any).timeOfDay === "number") this.todSource = c
      }
    }
    return this.todSource ? (this.todSource as any).timeOfDay : 0
  }

  /** dt seconds. Cheap: idle slots only count down. */
  update(dt: number, gaze?: vec3): void {
    if (gaze && Math.hypot(gaze.x, gaze.z) > 0.2) this.gazeAz = Math.atan2(gaze.x, -gaze.z) / DEG // keeps the last yaw while looking straight up / down
    if (gaze) this.gazeEl = Math.asin(Math.max(-1, Math.min(1, gaze.y))) / DEG
    if (this.active > 0 && (this.todClock -= dt) <= 0) {
      this.todClock = 1
      this.mat.mainPass.baseColor = birdColor(this.readTod())
    }
    if ((this.eventWait -= dt) <= 0) { // an event: 1-3 of the idle extra birds fly across (none left idle = no event)
      this.eventWait = EVENT_PERIOD // exactly every 9 s (a slow frame must not make two events fire back to back)
      const idle = this.slots.filter((s) => s.extra && s.t < 0)
      const want = 2 + Math.floor(this.rnd() * 2) // 2-3 birds per event
      for (let i = 0; i < want && idle.length > 0; i++) this.start(idle.splice(Math.floor(this.rnd() * idle.length), 1)[0])
    }
    for (const sl of this.slots) {
      if (sl.t < 0) {
        if (sl.extra) continue
        sl.wait -= dt
        if (sl.wait <= 0) this.start(sl)
        continue
      }
      sl.t += dt
      if (sl.t >= sl.dur) {
        sl.t = -1
        sl.root.enabled = false
        if (!sl.extra) sl.wait = MIN_WAIT + this.rnd() * (MAX_WAIT - MIN_WAIT)
        this.active--
        continue
      }
      const k = sl.t / sl.dur
      const dir = this.dirAt(sl, k)
      const p = dir.uniformScale(sl.dist)
      const ahead = this.dirAt(sl, Math.min(1, k + 0.02)).uniformScale(sl.dist)
      const fwd = ahead.sub(p)
      const tr = sl.root.getTransform()
      tr.setLocalPosition(p)
      if (fwd.length > 0.001) tr.setLocalRotation(quat.lookAt(fwd.uniformScale(-1).normalize(), vec3.up())) // -z (the nose) points along the flight
      // fade in / out by scale so a bird never pops; a bird also shrinks away near the centre of the user's view (never over the info card or the middle of the view)
      const edge = Math.min(sl.t, sl.dur - sl.t) / FADE_S
      let sc = Math.max(0.01, Math.min(1, edge))
      if (gaze) {
        const ang = Math.acos(Math.max(-1, Math.min(1, dir.dot(gaze)))) / DEG
        const k2 = Math.max(0, Math.min(1, (ang - CENTRE_NEAR_DEG) / (CENTRE_FAR_DEG - CENTRE_NEAR_DEG)))
        sc = Math.max(0.01, sc * k2 * k2 * (3 - 2 * k2))
      }
      tr.setLocalScale(new vec3(sc, sc, sc)) // a bird keeps its real size: the ones farther away simply look smaller
      // quick, subtle flap: both wings rotate about the body axis (z)
      for (let j = 0; j < sl.n; j++) {
        const g = sl.rigs[j]
        const a = FLAP_RAD * Math.sin(sl.t * FLAP_HZ * 2 * Math.PI + g.phase)
        g.right.getTransform().setLocalRotation(quat.angleAxis(a, vec3.forward()))
        g.left.getTransform().setLocalRotation(quat.angleAxis(-a, vec3.forward()))
      }
    }
  }
}
