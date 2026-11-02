// SkyHangarInput.ts
// Owns: the forgiving-input rules for imprecise hand tracking — aim-assist target choice, the tap-vs-drag
// threshold, and hover hysteresis. Pure functions / tiny state holders so LEAF can test them directly.
// Expects: nothing (plain module). Must not: touch the scene, SIK or UI.

import {DEG} from "./SkyHangarUtil"

/** A pinch is a tap when the hand moves less than this (cm) and the pinch lasts less than TAP_MAX_SECONDS. */
export const TAP_MAX_MOVE_CM = 1
export const TAP_MAX_SECONDS = 0.15
/** Arm's-length reference used to turn ray movement (angle) into hand movement (cm). */
export const TAP_REF_DISTANCE_CM = 40
/** Aim assist: a vehicle within this angle (deg) of the pinch ray is snapped to. */
export const AIM_ASSIST_DEG = 3
/** Two candidates this close (deg) to the ray count as equally close; the nearer to the camera wins. */
export const AIM_TIE_DEG = 0.1
/** A hover / target is kept this long (s) after the ray leaves it. */
export const HOVER_KEEP_SECONDS = 0.3

/** Movement of a pointing ray between two directions, in cm at the arm's-length reference distance. */
export function rayMoveCm(dir0: vec3, dir1: vec3, distCm: number = TAP_REF_DISTANCE_CM): number {
  return dir1.normalize().sub(dir0.normalize()).length * distCm
}

/** Released pinch: true = tap, false = it was a drag / hold. */
export function isTap(elapsedS: number, moveCm: number): boolean {
  return elapsedS < TAP_MAX_SECONDS && moveCm < TAP_MAX_MOVE_CM
}

/** Pinch still down: true once it can no longer be a tap (so a drag / hold starts). */
export function dragStarted(elapsedS: number, moveCm: number): boolean {
  return elapsedS >= TAP_MAX_SECONDS || moveCm >= TAP_MAX_MOVE_CM
}

export interface AimCandidate {
  id: string
  /** Unit direction from the ray origin to the candidate. */
  dir: vec3
  /** Distance from the camera, cm. */
  distCm: number
}

export function angleBetweenDeg(a: vec3, b: vec3): number {
  return Math.acos(Math.max(-1, Math.min(1, a.normalize().dot(b.normalize())))) / DEG
}

/**
 * Aim assist: among candidates within maxDeg of the ray, the one closest to the ray; candidates tied within
 * AIM_TIE_DEG go to the one nearest the camera. Returns null when nothing is in range.
 */
export function pickAimTarget(cands: AimCandidate[], rayDir: vec3, maxDeg: number = AIM_ASSIST_DEG): {id: string; angleDeg: number} | null {
  const inRange: {c: AimCandidate; ang: number}[] = []
  for (const c of cands) {
    const ang = angleBetweenDeg(c.dir, rayDir)
    if (ang <= maxDeg) inRange.push({c, ang})
  }
  if (inRange.length === 0) return null
  let minAng = Infinity
  for (const r of inRange) minAng = Math.min(minAng, r.ang)
  let best: {c: AimCandidate; ang: number} | null = null
  for (const r of inRange) {
    if (r.ang > minAng + AIM_TIE_DEG) continue
    if (!best || r.c.distCm < best.c.distCm || (r.c.distCm === best.c.distCm && r.ang < best.ang)) best = r
  }
  return best ? {id: best.c.id, angleDeg: best.ang} : null
}

/** Keeps the last raw value for keepS seconds after it disappears (null / "" = nothing). */
export class HoverHold<T> {
  private held: T | null = null
  private lostAt = -1
  constructor(private keepS: number = HOVER_KEEP_SECONDS) {}

  /** Feed the raw per-frame value; returns the value to act on. */
  update(raw: T | null, now: number): T | null {
    if (raw !== null) {
      this.held = raw
      this.lostAt = -1
    } else if (this.held !== null) {
      if (this.lostAt < 0) this.lostAt = now
      if (now - this.lostAt >= this.keepS) {
        this.held = null
        this.lostAt = -1
      }
    }
    return this.held
  }

  get value(): T | null { return this.held }
  reset(): void { this.held = null; this.lostAt = -1 }
}
