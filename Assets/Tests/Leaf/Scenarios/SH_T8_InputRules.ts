// T8: forgiving-input rules, tested on the pure functions in SkyHangarInput (aim-assist snap,
// tap-vs-drag threshold, hover hysteresis) plus the minimum hit area of the real controls.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {Checks, getMain, waitReady, requireInteractable} from "../SkyHangarTestKit"
import {
  AimCandidate, HoverHold, HOVER_KEEP_SECONDS, TAP_MAX_MOVE_CM, TAP_MAX_SECONDS, TAP_REF_DISTANCE_CM,
  dragStarted, isTap, pickAimTarget, rayMoveCm
} from "../../../Scripts/SkyHangarInput"
import {skyDir} from "../../../Scripts/SkyHangarUtil"
import {MIN_HIT_CM} from "../../../Scripts/SkyHangarSharedUI"

/** Candidate at (az, el) degrees on a dome of the given radius, as seen from the origin. */
function cand(id: string, az: number, el: number, dist: number = 400): AimCandidate {
  return {id, dir: skyDir(az, el), distCm: dist}
}

@component
export class SH_T8_InputRules extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("t8_input_rules")
    const main = getMain()
    await waitReady(main, c)

    // ---- aim assist ----
    const ray = skyDir(0, 30)
    const near = pickAimTarget([cand("far", 20, 30), cand("near", 2, 30)], ray)
    c.check("ray within 3 deg of a vehicle snaps to it", "inspection", !!near && near.id === "near", `pick=${near ? near.id : "none"}`)
    c.check("ray beyond 3 deg snaps to nothing", "inspection", pickAimTarget([cand("a", 6, 30)], ray) === null)
    const two = pickAimTarget([cand("b", 2.5, 30), cand("a", 1, 30)], ray)
    c.check("two in range: the one closest to the ray wins", "inspection", !!two && two.id === "a", `pick=${two ? two.id : "none"}`)
    const tie = pickAimTarget([cand("farther", 1, 30, 900), cand("nearer", 1, 30, 300)], ray)
    c.check("equally close to the ray: the one nearest the camera wins", "inspection", !!tie && tie.id === "nearer", `pick=${tie ? tie.id : "none"}`)
    c.check("no candidates -> null", "inspection", pickAimTarget([], ray) === null)

    // ---- tap vs drag ----
    c.check("0.10 s, 0.5 cm = tap", "inspection", isTap(0.1, 0.5))
    c.check("0.20 s, 0.5 cm = not a tap (hold)", "inspection", !isTap(0.2, 0.5))
    c.check("0.10 s, 1.5 cm = not a tap (drag)", "inspection", !isTap(0.1, 1.5))
    c.check("exactly 0.15 s = not a tap", "inspection", !isTap(TAP_MAX_SECONDS, 0))
    c.check("exactly 1 cm = not a tap", "inspection", !isTap(0.05, TAP_MAX_MOVE_CM))
    c.check("held pinch: still a tap candidate at 0.10 s / 0.5 cm", "inspection", !dragStarted(0.1, 0.5))
    c.check("held pinch: drag starts at 0.15 s", "inspection", dragStarted(0.15, 0))
    c.check("held pinch: drag starts at 1 cm", "inspection", dragStarted(0.05, 1))
    const d0 = skyDir(0, 30)
    const moved = rayMoveCm(d0, skyDir(1, 30), TAP_REF_DISTANCE_CM) // ~0.87 cm of ray travel at 40 cm
    c.check("1 deg ray movement at arm's length is under 1 cm", "inspection", moved < TAP_MAX_MOVE_CM, `moved=${moved.toFixed(2)} cm`)
    c.check("2 deg ray movement at arm's length is over 1 cm", "inspection", rayMoveCm(d0, skyDir(2, 30)) >= TAP_MAX_MOVE_CM)

    // ---- hover hysteresis ----
    const h = new HoverHold<string>()
    c.check("hover starts on the object", "inspection", h.update("A", 0) === "A")
    c.check("0.1 s after the ray leaves it is still held", "inspection", h.update(null, 0.1) === "A")
    c.check("0.29 s after leaving it is still held", "inspection", h.update(null, 0.1 + HOVER_KEEP_SECONDS - 0.01) === "A")
    c.check("0.3 s after leaving it is released", "inspection", h.update(null, 0.1 + HOVER_KEEP_SECONDS) === null)
    h.update("A", 1)
    h.update(null, 1.1)
    c.check("coming back within 0.3 s cancels the release timer", "inspection", h.update("A", 1.2) === "A" && h.update(null, 1.45) === "A")
    c.check("a new object replaces the held one at once", "inspection", h.update("B", 2) === "B")

    // ---- hit areas on real controls (collider at least 3.5 cm) ----
    const names = ["SkyMarker_DL31", "SkyMarker_VS93"]
    for (const n of names) {
      let r = 0
      try { r = (requireInteractable(n).colliders[0].shape as SphereShape).radius } catch (e) { r = 0 }
      c.check(`${n} hit radius >= ${MIN_HIT_CM / 2} cm`, "inspection", r * 2 >= MIN_HIT_CM, `diameter=${(r * 2).toFixed(1)} cm`)
    }
    c.finish()
  }
}
