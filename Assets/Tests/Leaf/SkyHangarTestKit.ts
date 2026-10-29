// SkyHangarTestKit.ts
// Shared helpers for the SkyHangar LEAF scenarios: locate the SkyHangarMain component, soft-check
// collector (per-assertion PASS/FAIL lines in the log, one failure summary at the end), polling
// waits, and a LEAF interactor that can press / hold / re-aim / release (real SIK input path).
// Test-only code: never modifies game logic.

import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {findInteractableByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {findSceneObjectByName, nextFrame, sleep, withTimeout} from "Leaf.lspkg/Utils/common/Utils"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {InteractorTriggerType} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {SkyHangarMain} from "../../Scripts/SkyHangarMain"

export type InputKind = "real input" | "test hook" | "inspection"

/** Expected card / plaque values copied from Assets/Data/flights.json. */
export const FLIGHTS = {
  VS93: {airline: "Virgin Atlantic Airways", flight: "VS93", callsign: "VIR93", origin: "LHR", destination: "CUN",
    departUtc: "13:03", arriveUtc: "22:34", aircraftType: "A35K", aircraftTypeName: "Airbus A350-1000",
    altitude: "6,100 ft", speed: "256 kt", colors: ["#E8E8F0", "#E4002B"]},
  DL31: {airline: "Delta Air Lines", flight: "DL31", callsign: "DAL31", origin: "LHR", destination: "ATL",
    departUtc: "13:02", arriveUtc: "21:13", aircraftType: "A332", aircraftTypeName: "Airbus A330-200",
    altitude: "5,700 ft", speed: "275 kt", colors: ["#F2F4F8", "#C8102E"]},
  SAT20580: {airline: "NASA / ESA", flight: "NORAD 20580", callsign: "HST", aircraftType: "HST"},
  VLZ05: {airline: "Private operator", flight: "VLZ05", aircraftType: "A109"}
}

export class Checks {
  private failures: string[] = []
  private count = 0
  constructor(private scenario: string) {
    print(`[SH-TEST] BEGIN ${scenario}`)
  }

  check(name: string, input: InputKind, pass: boolean, detail: string = ""): boolean {
    this.count++
    const line = `[SH-TEST] ${pass ? "PASS" : "FAIL"} ${this.scenario} :: ${name} [${input}]${detail ? " :: " + detail : ""}`
    print(line)
    if (!pass) this.failures.push(`${name} [${input}]${detail ? " :: " + detail : ""}`)
    return pass
  }

  includes(name: string, input: InputKind, text: string, needle: string): boolean {
    return this.check(name, input, text.indexOf(needle) >= 0, `"${needle}" in "${text}"`)
  }

  /** Throws (fails the LEAF scenario) if any check failed. */
  finish(): void {
    print(`[SH-TEST] END ${this.scenario} :: ${this.count - this.failures.length}/${this.count} passed`)
    expect(this.failures.length, `${this.scenario}: ${this.failures.length} check(s) failed:\n - ${this.failures.join("\n - ")}`).toBe(0)
  }
}

export function getMain(): SkyHangarMain {
  const so = findSceneObjectByName("SkyHangar")
  if (!so) throw new Error('SceneObject "SkyHangar" not found')
  const main = so.getComponent(SkyHangarMain.getTypeName()) as SkyHangarMain
  if (!main) throw new Error("SkyHangarMain component not found on SkyHangar")
  return main
}

/** Polls every frame until cond() is true or timeout; returns whether it became true. */
export async function waitUntil(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const t0 = getTime()
  while ((getTime() - t0) * 1000 < timeoutMs) {
    try {
      if (cond()) return true
    } catch (e) {
      // keep polling
    }
    await nextFrame()
  }
  try {
    return cond()
  } catch (e) {
    return false
  }
}

export async function waitReady(main: SkyHangarMain, c: Checks): Promise<void> {
  const ok = await waitUntil(() => main.isReady(), 15000)
  c.check("Lens reports isReady()", "inspection", ok)
  if (!ok) c.finish()
  await sleep(300)
}

/** Records every distinct held state seen over `ms`. */
export async function recordStates(read: () => string, ms: number, onFrame?: () => void): Promise<string[]> {
  const seen: string[] = []
  const t0 = getTime()
  while ((getTime() - t0) * 1000 < ms) {
    const s = read()
    if (seen.length === 0 || seen[seen.length - 1] !== s) seen.push(s)
    if (onFrame) onFrame()
    await nextFrame()
  }
  return seen
}

export function findChild(root: SceneObject, name: string): SceneObject | null {
  if (root.name === name) return root
  for (let i = 0; i < root.getChildrenCount(); i++) {
    const r = findChild(root.getChild(i), name)
    if (r) return r
  }
  return null
}

export function countChildrenWithPrefix(root: SceneObject, prefix: string): number {
  let n = 0
  for (let i = 0; i < root.getChildrenCount(); i++) {
    const ch = root.getChild(i)
    if (ch.name.indexOf(prefix) === 0) n++
    n += countChildrenWithPrefix(ch, prefix)
  }
  return n
}

export function collectBaseColors(root: SceneObject, out: vec4[] = []): vec4[] {
  const rmv = root.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
  if (rmv && rmv.mainMaterial) out.push(rmv.mainMaterial.mainPass.baseColor)
  for (let i = 0; i < root.getChildrenCount(); i++) collectBaseColors(root.getChild(i), out)
  return out
}

export function hexToVec4(hex: string): vec4 {
  const h = hex.replace("#", "")
  return new vec4(parseInt(h.substring(0, 2), 16) / 255, parseInt(h.substring(2, 4), 16) / 255, parseInt(h.substring(4, 6), 16) / 255, 1)
}

export function colorClose(a: vec4, b: vec4, tol: number = 0.02): boolean {
  return Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol && Math.abs(a.z - b.z) < tol
}

export function fmtColor(c: vec4): string {
  return `(${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)})`
}

export function fmtVec(v: vec3): string {
  return `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`
}

/** Angle in degrees between two rotations. */
export function quatAngleDeg(a: quat, b: quat): number {
  const d = Math.abs(a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z)
  return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI
}

export function requireInteractable(name: string): Interactable {
  const it = findInteractableByName(name)
  if (!it) throw new Error(`Interactable "${name}" not found`)
  return it
}

/**
 * Runtime-only head override for the scenario: pauses the camera's DeviceTracking and holds the
 * camera at a chosen rotation every frame; restore() puts tracking and rotation back.
 */
export class CameraRig {
  readonly cam: SceneObject
  private tracking: DeviceTracking | null
  private wasEnabled: boolean
  private rot0: quat
  private forced: quat
  private ev: SceneEvent

  constructor(owner: BaseScriptComponent) {
    this.cam = findSceneObjectByName("Camera Object")
    if (!this.cam) throw new Error('SceneObject "Camera Object" not found')
    this.tracking = this.cam.getComponent("Component.DeviceTracking") as DeviceTracking
    this.wasEnabled = this.tracking ? this.tracking.enabled : false
    const t = this.cam.getTransform()
    this.rot0 = t.getWorldRotation()
    this.forced = this.rot0
    if (this.tracking) this.tracking.enabled = false
    this.ev = owner.createEvent("UpdateEvent")
    this.ev.bind(() => this.cam.getTransform().setWorldRotation(this.forced))
  }

  get pos(): vec3 { return this.cam.getTransform().getWorldPosition() }
  get rot(): quat { return this.cam.getTransform().getWorldRotation() }
  get forward(): vec3 { return this.rot.multiplyVec3(new vec3(0, 0, -1)) }

  /** Camera looks along world direction d (camera -Z = d), up kept to world up. */
  lookDir(d: vec3): void {
    this.forced = quat.lookAt(d.normalize().uniformScale(-1), vec3.up())
    this.cam.getTransform().setWorldRotation(this.forced)
  }
  lookAt(p: vec3): void { this.lookDir(p.sub(this.pos)) }
  /** Yaw (deg, + = turn right) and pitch (deg, + = up) relative to compass north (-Z). */
  lookYawPitch(yawDeg: number, pitchDeg: number): void {
    const y = (yawDeg * Math.PI) / 180
    const p = (pitchDeg * Math.PI) / 180
    this.lookDir(new vec3(Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)))
  }
  setRotation(q: quat): void {
    this.forced = q
    this.cam.getTransform().setWorldRotation(q)
  }
  /** Current yaw/pitch of the forced view, degrees. */
  yawPitch(): vec2 {
    const f = this.forward
    return new vec2((Math.atan2(f.x, -f.z) * 180) / Math.PI, (Math.asin(Math.max(-1, Math.min(1, f.y))) * 180) / Math.PI)
  }
  restore(): void {
    this.ev.enabled = false
    if (this.tracking) this.tracking.enabled = this.wasEnabled
    this.cam.getTransform().setWorldRotation(this.rot0)
  }
}

export function angleDeg(a: vec3, b: vec3): number {
  return (Math.acos(Math.max(-1, Math.min(1, a.normalize().dot(b.normalize())))) * 180) / Math.PI
}

/** True when the object's +Z (UIKit front) faces the camera within maxDeg. */
export function facesCamera(obj: SceneObject, camPos: vec3, maxDeg: number = 10): {ok: boolean; deg: number} {
  const t = obj.getTransform()
  const front = t.getWorldRotation().multiplyVec3(vec3.forward())
  const deg = angleDeg(front, camPos.sub(t.getWorldPosition()))
  return {ok: deg <= maxDeg, deg}
}

/**
 * Real-SIK-input interactor: drives the SIK interactor state (hover / select) exactly like
 * DefaultLeafInteractor, but lets the scenario control how long the pinch is held and where the
 * ray points while it is held. That is what the Lens's tap-vs-pull timing logic consumes.
 */
export class SkyHangarLeafInteractor extends DefaultLeafInteractor {
  constructor() {
    super("SkyHangarLeafInteractor")
  }

  /** Hover a target and keep hovering (no pinch). */
  async beginHover(target: Interactable): Promise<void> {
    await this.enterHover(target)
  }

  async endHover(): Promise<void> {
    await this.exitHover()
  }

  /** Hover + start a pinch on the target; stays pinched until releasePinch(). */
  async pinchDown(target: Interactable): Promise<void> {
    await this.enterHover(target)
    await nextFrame()
    this.setTriggerType(InteractorTriggerType.Select)
    await nextFrame()
  }

  /** Point the (still pinched) ray at a world position. */
  aimRayAt(world: vec3): void {
    this.endPoint = world
  }

  /**
   * Real SIK trigger with a timeout: records a failing check (with the target's enabled/collider state)
   * instead of hanging the scenario when SIK never delivers hover/trigger events.
   */
  async triggerChecked(c: Checks, target: Interactable, name: string, timeoutMs: number = 4000): Promise<boolean> {
    const so = target.getSceneObject()
    const diag = `enabled=${target.enabled} inHierarchy=${so.isEnabledInHierarchy} colliders=${target.colliders.length} worldScale=${so.getTransform().getWorldScale().x.toFixed(2)}`
    try {
      await withTimeout(this.trigger(target), timeoutMs, `trigger "${name}" got no SIK hover/trigger events in ${timeoutMs} ms`)
      return true
    } catch (e) {
      c.check(`real trigger on ${name} completes`, "real input", false, `${e} (${diag})`)
      this.setTriggerType(InteractorTriggerType.None)
      this.overrideInteractable = undefined
      this.resetStartEndPoint()
      await nextFrame()
      return false
    }
  }

  /** Pinch while targeting nothing (SIK currentInteractable = null). */
  async pinchNothing(holdMs: number): Promise<void> {
    this.overrideInteractable = undefined
    await nextFrame()
    this.setTriggerType(InteractorTriggerType.Select)
    await sleep(holdMs)
    this.setTriggerType(InteractorTriggerType.None)
    await nextFrame()
    await nextFrame()
  }

  /** Move the (still pinched) ray end point by a world-space delta (sideways drag). */
  shiftRay(delta: vec3): void {
    this.endPoint = this.endPoint.add(delta)
  }

  async releasePinch(): Promise<void> {
    this.setTriggerType(InteractorTriggerType.None)
    await nextFrame()
    await nextFrame()
    this.resetStartEndPoint()
    this.overrideInteractable = undefined
    await nextFrame()
  }

  async pinchFor(target: Interactable, holdMs: number): Promise<void> {
    await this.pinchDown(target)
    await sleep(holdMs)
    await this.releasePinch()
  }
}
