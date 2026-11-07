// SkyHangarEdgeArrows.ts
// Owns: the "something needs attention out of view" cue. When no sky object is in view, small
// arrows sit near the edge of the view pointing toward the nearest objects; the arrow for the
// single nearest aircraft is larger and gently pulses. The label text for that arrow is drawn by
// SkyHangarLabelsUI from getNearestLabel()/getNearestLabelWorldPos(). Nothing moves the sky.
// Expects @inputs: camera object (+ its Camera component), sky controller. Must not: render text.

import {SkyObjectInfo} from "./SkyHangarFlightData"
import {SkyHangarSkyController} from "./SkyHangarSkyController"
import {makeObj, DEG} from "./SkyHangarUtil"
import {MARK, STROKE} from "./SkyHangarSharedUI"

interface Arrow {
  obj: SceneObject
  mat: Material
  glow: Material
}

@component
export class SkyHangarEdgeArrows extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarEdgeArrows – off-screen pointers</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("The main camera SceneObject")
  cameraObject!: SceneObject
  @input
  @hint("Sky controller (marker positions)")
  sky!: SkyHangarSkyController
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("How many arrows to show at most")
  @widget(new SliderWidget(1, 10, 1))
  maxArrows: number = 5
  @input
  @hint("Distance of the arrow ring in front of the eyes, cm")
  @widget(new SliderWidget(40, 150, 1))
  ringDistanceCm: number = 80
  @input
  @hint("How close to the display edge the arrows sit (1 = right on the edge of the camera FOV)")
  @widget(new SliderWidget(0.5, 1, 0.01))
  edgeInset: number = 0.86
  @input
  @hint("Treat an object as 'in view' when it is within this many degrees of the view centre")
  @widget(new SliderWidget(5, 40, 1))
  inViewHalfAngleDeg: number = 17
  @input("vec4", "{0.95, 0.97, 1.0, 1.0}")
  @hint("Arrow colour (soft white)")
  @widget(new ColorWidget())
  arrowTint: vec4 = new vec4(0.95, 0.97, 1.0, 1.0)
  @input("vec4", "{0.38, 0.68, 1.0, 1.0}")
  @hint("Glow colour of the nearest-aircraft arrow (accent)")
  @widget(new ColorWidget())
  nearestGlow: vec4 = new vec4(0.38, 0.68, 1.0, 1.0)
  @ui.group_end

  private root!: SceneObject
  private arrows: Arrow[] = []
  private visibleCount = 0
  private active = false
  private skipN = 0
  private nearest: SkyObjectInfo | null = null
  private nearestLabelPos = vec3.zero()
  private enabledByMode = true
  private camComp: Camera | null = null

  /** Half extents (cm) of the display rectangle at ringDistance, from the camera fov + aspect. */
  private halfExtents(): vec2 {
    if (!this.camComp) this.camComp = this.cameraObject.getComponent("Component.Camera") as Camera
    const c = this.camComp
    let halfV = 0.35
    let aspect = 1
    if (c) {
      halfV = c.fov / 2
      aspect = c.aspect > 0.1 ? c.aspect : 1
    }
    const halfH = Math.atan(Math.tan(halfV) * aspect)
    const d = this.ringDistanceCm
    return new vec2(d * Math.tan(halfH * this.edgeInset), d * Math.tan(halfV * this.edgeInset))
  }
  /** Display half-angles (deg) used for arrow placement — for tests. */
  getEdgeHalfAnglesDeg(): vec2 {
    const he = this.halfExtents()
    return new vec2((Math.atan(he.x / this.ringDistanceCm) * 180) / Math.PI, (Math.atan(he.y / this.ringDistanceCm) * 180) / Math.PI)
  }

  onAwake(): void {
    if (!this.cameraObject || !this.sky) {
      print("SkyHangarEdgeArrows: required @input not wired")
      return
    }
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  // ---------- public API ----------
  isArrowVisible(): boolean { return this.active }
  getVisibleSkyCount(): number { return this.visibleCount }
  getNearestId(): string { return this.active && this.nearest ? this.nearest.id : "" }
  getNearestLabel(): string {
    if (!this.active || !this.nearest) return ""
    const n = this.nearest
    return n.kind === "satellite" ? n.aircraftType + " · " + n.flight : n.airline + " " + n.flight
  }
  getNearestLabelWorldPos(): vec3 { return this.nearestLabelPos }
  /** Hide arrows while a panel (radar/hangar) owns the user's attention. */
  setSuppressed(s: boolean): void { this.enabledByMode = !s }

  /** Chevron size in cm at the arrow ring (from the shared mark tokens). */
  private chevronSizeCm(): number { return MARK.cm(MARK.chevronDeg, this.ringDistanceCm) }

  private build(): void {
    this.root = makeObj(this.sceneObject, "ArrowRing")
    const kit = this.sky.partKit
    for (let i = 0; i < this.maxArrows; i++) {
      const obj = makeObj(this.root, i === 0 ? "EdgeArrow_Nearest" : "EdgeArrow_" + i)
      const mat = kit.uniqueUnlit(this.arrowTint)
      const glow = kit.uniqueUnlit(new vec4(this.nearestGlow.x, this.nearestGlow.y, this.nearestGlow.z, 0))
      // Chevron: two hairline bars meeting at the tip (+Y = pointing direction), rounded ends.
      // The object is scaled by the chevron size, so the stroke is expressed in that unit.
      const wf = STROKE.at(this.ringDistanceCm) / this.chevronSizeCm()
      for (const sx of [-1, 1]) {
        const th = sx * 0.6
        const c = new vec3(sx * 0.28, -0.05, 0)
        const dx = -Math.sin(th) * 0.5, dy = Math.cos(th) * 0.5
        kit.part(obj, sx < 0 ? "BarL" : "BarR", kit.box, mat, c, new vec3(wf, 1.0, wf * 0.5), quat.angleAxis(th, vec3.forward()))
        kit.part(obj, "CapA" + sx, kit.sphere, mat, new vec3(c.x + dx, c.y + dy, 0), new vec3(wf, wf, wf * 0.5))
        kit.part(obj, "CapB" + sx, kit.sphere, mat, new vec3(c.x - dx, c.y - dy, 0), new vec3(wf, wf, wf * 0.5))
        // Soft glow behind (lit only on the nearest arrow)
        kit.part(obj, sx < 0 ? "GlowL" : "GlowR", kit.box, glow, new vec3(c.x, c.y, -0.05), new vec3(wf * 3, 1.1, 0.05), quat.angleAxis(th, vec3.forward()))
      }
      obj.enabled = false
      this.arrows.push({obj, mat, glow})
    }
  }

  private update(): void {
    if (!this.sky.isBuilt()) return
    if (!this.root) this.build()
    // While something is in view (no arrows shown) the in-view test only needs to run about 15 times a second; arrows themselves update every frame.
    if (!this.active && (!this.enabledByMode || (++this.skipN & 3) !== 0)) return // (also nothing to do while suppressed and already hidden)
    const ct = this.cameraObject.getTransform()
    const camPos = ct.getWorldPosition()
    const camRot = ct.getWorldRotation()
    const inv = camRot.invert()
    const fwd = camRot.multiplyVec3(new vec3(0, 0, -1))

    // Which sky objects are in view? Rank the rest by angle from the view centre.
    let visible = 0
    const ranked: {info: SkyObjectInfo; ang: number; local: vec3}[] = []
    for (const info of this.sky.getInfos()) {
      const p = this.sky.getMarkerWorldPos(info.id)
      if (!p) continue
      const d = p.sub(camPos).normalize()
      const ang = Math.acos(Math.max(-1, Math.min(1, d.dot(fwd)))) / DEG
      if (ang < this.inViewHalfAngleDeg) visible++
      ranked.push({info, ang, local: inv.multiplyVec3(d)})
    }
    this.visibleCount = visible
    this.active = visible === 0 && this.enabledByMode
    // Keep the ring head-locked (small, at the edge of view).
    this.root.getTransform().setWorldPosition(camPos)
    this.root.getTransform().setWorldRotation(camRot)
    if (!this.active) {
      for (const a of this.arrows) a.obj.enabled = false
      this.nearest = null
      return
    }
    ranked.sort((a, b) => a.ang - b.ang)
    // Nearest *aircraft* gets the big labelled arrow (planes/helicopters before satellites).
    const firstAircraft = ranked.findIndex((r) => r.info.kind !== "satellite")
    if (firstAircraft > 0) {
      const [x] = ranked.splice(firstAircraft, 1)
      ranked.unshift(x)
    }
    const pulse = 1 + 0.06 * Math.sin(getTime() * 4.5)
    for (let i = 0; i < this.arrows.length; i++) {
      const a = this.arrows[i]
      const r = ranked[i]
      if (!r) {
        a.obj.enabled = false
        continue
      }
      a.obj.enabled = true
      // Direction in the view plane (camera-local x right, y up)
      let vx = r.local.x
      let vy = r.local.y
      const len = Math.sqrt(vx * vx + vy * vy)
      if (len < 0.0001) { vx = 0; vy = 1 } else { vx /= len; vy /= len }
      // Point on the edge of the actual display FOV (a rectangle from the camera fov + aspect), slightly inset
      const he = this.halfExtents()
      const sc = 1 / Math.max(Math.abs(vx) / he.x, Math.abs(vy) / he.y, 1e-4)
      const ex = vx * sc
      const ey = vy * sc
      const big = i === 0
      const s = this.chevronSizeCm() * (big ? 1.25 * pulse : 1.0)
      const t = a.obj.getTransform()
      t.setLocalPosition(new vec3(ex, ey, -this.ringDistanceCm))
      t.setLocalRotation(quat.angleAxis(Math.atan2(-vx, vy), vec3.forward()))
      t.setLocalScale(new vec3(s, s, s))
      const alpha = big ? 0.8 + 0.2 * Math.sin(getTime() * 4.5) : STROKE.opacity
      a.mat.mainPass.baseColor = new vec4(this.arrowTint.x, this.arrowTint.y, this.arrowTint.z, alpha)
      a.glow.mainPass.baseColor = new vec4(this.nearestGlow.x, this.nearestGlow.y, this.nearestGlow.z, big ? 0.25 + 0.2 * Math.sin(getTime() * 4.5) : 0)
      if (big) {
        this.nearest = r.info
        // Label sits just inside the big arrow, toward the view centre.
        // Push mostly sideways for left/right arrows (labels are wide), vertically for up/down ones.
        const lx = ex - vx * Math.min(he.x * 0.45, 11)
        const ly = ey - vy * 3.6
        this.nearestLabelPos = camPos.add(camRot.multiplyVec3(new vec3(lx, ly, -this.ringDistanceCm)))
      }
    }
  }
}
