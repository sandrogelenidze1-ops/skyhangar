// Criterion 1b: with nothing in view, a larger pulsing edge arrow with an airline + flight label
// points to the nearest aircraft. The view is forced straight down (DeviceTracking paused at
// runtime for the duration of the scenario, then restored).
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {SKY_OBJECTS} from "../../../Scripts/SkyHangarFlightData"
import {Checks, getMain, waitReady, fmtVec} from "../SkyHangarTestKit"

@component
export class SH_C1_EdgeArrow extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("c1_edge_arrow")
    const main = getMain()
    await waitReady(main, c)
    const cam = findSceneObjectByName("Camera Object")
    const tracking = cam.getComponent("Component.DeviceTracking") as DeviceTracking
    const ct = cam.getTransform()
    const rot0 = ct.getWorldRotation()
    const wasEnabled = tracking ? tracking.enabled : false
    let forced = quat.angleAxis(-Math.PI / 2, vec3.right()) // camera -Z -> world down
    const ev = this.createEvent("UpdateEvent")
    ev.bind(() => ct.setWorldRotation(forced))
    try {
      if (tracking) tracking.enabled = false
      ct.setWorldRotation(forced)
      await sleep(700)
      const fwd = ct.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
      c.check("precondition: view forced straight down", "test hook", fwd.y < -0.95, `forward ${fmtVec(fwd.uniformScale(100))}`)
      c.check("no sky object in view", "inspection", main.getVisibleSkyCount() === 0, `visible=${main.getVisibleSkyCount()}`)
      c.check("edge arrow active", "inspection", main.isEdgeArrowVisible())
      const arrow = findSceneObjectByName("EdgeArrow_Nearest")
      c.check("EdgeArrow_Nearest SceneObject enabled", "inspection", !!arrow && arrow.isEnabledInHierarchy)

      // Nearest aircraft computed independently from marker positions.
      const camPos = ct.getWorldPosition()
      let best = ""
      let bestAng = 999
      for (const o of SKY_OBJECTS) {
        if (o.kind === "satellite") continue
        const p = main.getSkyObjectWorldPos(o.id)
        if (!p) continue
        const ang = (Math.acos(Math.max(-1, Math.min(1, p.sub(camPos).normalize().dot(fwd)))) * 180) / Math.PI
        if (ang < bestAng) {
          bestAng = ang
          best = o.id
        }
      }
      const nid = main.getNearestArrowId()
      c.check("big arrow targets the nearest aircraft", "inspection", nid === best, `arrow "${nid}", expected "${best}" (${bestAng.toFixed(1)} deg)`)
      const info = SKY_OBJECTS.find((o) => o.id === nid)
      const label = main.getNearestArrowLabel()
      c.check("arrow label has airline + flight number", "inspection",
        !!info && label.indexOf(info.airline) >= 0 && label.indexOf(info.flight) >= 0, `label "${label}"`)
      const shown = String(main.labels.getArrowLabelText())
      c.check("on-screen arrow label text matches", "inspection", shown === label && shown.length > 0, `shown "${shown}"`)

      // Points toward it: the chevron tip (+Y local) agrees with the target direction in the view plane.
      if (arrow && info) {
        const inv = ct.getWorldRotation().invert()
        const local = inv.multiplyVec3(main.getSkyObjectWorldPos(nid).sub(camPos).normalize())
        const dir2 = new vec2(local.x, local.y).normalize()
        const tip = arrow.getTransform().getLocalRotation().multiplyVec3(vec3.up())
        const tip2 = new vec2(tip.x, tip.y).normalize()
        const dot = dir2.x * tip2.x + dir2.y * tip2.y
        c.check("arrow points toward the nearest aircraft", "inspection", dot > 0.9, `dot=${dot.toFixed(2)}`)
      }

      // Larger + pulsing.
      let mn = 1e9
      let mx = -1e9
      let otherMax = 0
      const other = findSceneObjectByName("EdgeArrow_1")
      const t0 = getTime()
      while (getTime() - t0 < 1.6) {
        if (arrow) {
          const s = arrow.getTransform().getLocalScale().x
          mn = Math.min(mn, s)
          mx = Math.max(mx, s)
        }
        if (other && other.enabled) otherMax = Math.max(otherMax, other.getTransform().getLocalScale().x)
        await nextFrame()
      }
      c.check("nearest arrow pulses (scale varies over time)", "inspection", mx - mn > 0.2, `scale ${mn.toFixed(2)}..${mx.toFixed(2)}`)
      c.check("nearest arrow larger than the other arrows", "inspection", otherMax > 0 && mn > otherMax, `nearest min ${mn.toFixed(2)} vs other max ${otherMax.toFixed(2)}`)

      // Contrast: look straight at an aircraft -> arrows go away.
      const target = main.getSkyObjectWorldPos("VS93")
      forced = quat.lookAt(camPos.sub(target).normalize(), vec3.up())
      await sleep(400)
      const f2 = ct.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
      c.check("precondition: view now aimed at VS93", "test hook", f2.dot(target.sub(camPos).normalize()) > 0.99, `forward ${fmtVec(f2.uniformScale(100))}`)
      c.check("looking at VS93: it counts as in view", "inspection", main.getVisibleSkyCount() >= 1, `visible=${main.getVisibleSkyCount()}`)
      c.check("looking at VS93: edge arrow hidden", "inspection", !main.isEdgeArrowVisible())
    } finally {
      ev.enabled = false
      if (tracking) tracking.enabled = wasEnabled
      ct.setWorldRotation(rot0)
    }
    c.finish()
  }
}
