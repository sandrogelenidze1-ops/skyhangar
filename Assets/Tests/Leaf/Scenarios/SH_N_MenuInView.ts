// Round 1 item 1: the Sky / Radar / Hangar bar follows the head (lazy drift, ~1 s) and is never left
// behind: after turning and looking down it is back in view within ~1.5 s; dim while looking at the
// sky, bright when looking down near it. Head driven by a runtime-only camera override.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, waitUntil, CameraRig, angleDeg, SkyHangarLeafInteractor, requireInteractable} from "../SkyHangarTestKit"

@component
export class SH_N_MenuInView extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("n_menu_in_view")
    const main = getMain()
    await waitReady(main, c)
    const rig = new CameraRig(this)
    try {
      rig.lookYawPitch(0, 0)
      await sleep(1500)
      c.check("looking ahead: menu in view", "test hook", main.isMenuInView())
      const l = rig.rot.invert().multiplyVec3(main.getMenuWorldPos().sub(rig.pos))
      c.check("menu sits in the lower part of the view", "inspection", l.y < 0 && l.z < 0, `local (${l.x.toFixed(1)}, ${l.y.toFixed(1)}, ${l.z.toFixed(1)})`)
      c.check("menu dim while looking at the horizon/sky", "inspection", !main.isMenuBright())

      // Head-locked bottom band: for head pitch -80..+80 and yaw -180..180 the bar settles at idleDown below the gaze
      // centre, D from the head, and while gliding it stays inside [idleDown-4, idleDown+12] deg below gaze, within 35 deg sideways.
      const idleDown = main.menuBar.belowViewDeg
      const D = Math.max(70, Math.min(120, main.menuBar.distanceCm))
      const poseOf = (): {below: number; az: number; dist: number} => {
        const l = rig.rot.invert().multiplyVec3(main.getMenuWorldPos().sub(rig.pos))
        return {below: (-Math.atan2(l.y, Math.hypot(l.x, l.z)) * 180) / Math.PI, az: (Math.atan2(l.x, -l.z) * 180) / Math.PI, dist: l.length}
      }
      let bandOk = true
      let bandWorst = ""
      const poses: [number, number][] = [[0, 80], [0, -80], [90, 40], [-90, -40], [180, 0], [-180, 80], [135, -60], [-135, 60], [0, 0]]
      for (const [yaw, pitch] of poses) {
        rig.lookYawPitch(yaw, pitch)
        const t0 = getTime()
        while (getTime() - t0 < 2.4) {
          await nextFrame()
          const q = poseOf()
          if (q.below < idleDown - 4 - 0.5 || q.below > idleDown + 12 + 0.5 || Math.abs(q.az) > 35.5 || q.dist < 69.5) {
            bandOk = false
            bandWorst = `yaw ${yaw} pitch ${pitch}: below ${q.below.toFixed(1)}, az ${q.az.toFixed(1)}, dist ${q.dist.toFixed(1)}`
          }
        }
        const q = poseOf()
        c.check(`yaw ${yaw} pitch ${pitch}: settled ${idleDown} deg below gaze, ${D} cm away`, "inspection",
          Math.abs(q.below - idleDown) <= 1 && Math.abs(q.az) <= 1 && Math.abs(q.dist - D) <= 1, `below ${q.below.toFixed(1)}, az ${q.az.toFixed(1)}, dist ${q.dist.toFixed(1)}`)
      }
      c.check("while gliding the bar stays in the bottom band (idle-4..idle+12 deg, <=35 deg sideways, >=70 cm)", "inspection", bandOk, bandWorst)
      rig.lookYawPitch(0, 0)
      await sleep(1000)

      const steps: [string, number, number][] = [
        ["turn 90 deg right", 90, 0],
        ["turn back 120 deg left and look up 30 deg", -30, 30],
        ["turn 60 deg right and look down 35 deg", 30, -35],
        ["turn 180 deg", 210, -10]
      ]
      for (const [name, yaw, pitch] of steps) {
        rig.lookYawPitch(yaw, pitch)
        let left = false
        for (let i = 0; i < 3; i++) {
          await nextFrame()
          if (!main.isMenuInView()) left = true
        }
        const back = await waitUntil(() => main.isMenuInView(), 1500)
        c.check(`${name}: menu back in view within 1.5 s`, "test hook", back, `briefly out of view: ${left}`)
        await sleep(500)
        c.check(`${name}: still in view after settling`, "test hook", main.isMenuInView())
        const d = main.getMenuWorldPos().distance(rig.pos)
        c.check(`${name}: menu 70-120 cm from the head`, "inspection", d > 69.5 && d < 120.5, `${d.toFixed(0)} cm`)
      }
      // Looking down near it -> bright (last step looks down 10 deg; look further down).
      rig.lookYawPitch(210, -35)
      await sleep(1500)
      c.check("looking down near the bar: menu in view and bright", "test hook", main.isMenuInView() && main.isMenuBright())
      // Still usable after following: real click on Radar.
      const it = new SkyHangarLeafInteractor()
      await it.triggerChecked(c, requireInteractable("MenuButton_Radar"), "MenuButton_Radar")
      await waitUntil(() => main.isRadarVisible(), 1500)
      c.check("followed menu still clickable (Radar)", "real input", main.getMode() === "radar")
      const radarDir = main.radar.sceneObject.getTransform().getWorldPosition().sub(rig.pos)
      const flatF = new vec3(rig.forward.x, 0, rig.forward.z)
      c.check("radar opens in the direction now faced", "inspection", angleDeg(new vec3(radarDir.x, 0, radarDir.z), flatF) < 10)
    } finally {
      rig.restore()
    }
    c.finish()
  }
}
