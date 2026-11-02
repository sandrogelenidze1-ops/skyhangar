// Round 1 item 2: the card opens 10 deg to the right of the tapped plane at gaze height, 1.2 m away,
// facing the user; if the plane is > 20 deg off-centre it opens at view centre instead; it then
// lazy-follows the head (~0.9 s) so it is back in view after a turn. Tap elsewhere closes it.
// The head is driven by a runtime-only camera override (DeviceTracking paused, then restored).
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, waitUntil, CameraRig, angleDeg, facesCamera, SkyHangarLeafInteractor, requireInteractable} from "../SkyHangarTestKit"
import {SkyHangarMain} from "../../../Scripts/SkyHangarMain"

function camLocal(rig: CameraRig, p: vec3): vec3 {
  return rig.rot.invert().multiplyVec3(p.sub(rig.pos)).normalize()
}

function checkPlacement(c: Checks, main: SkyHangarMain, rig: CameraRig, ref: vec3, tag: string, input: "real input" | "test hook"): void {
  const card = main.getCardWorldPos()
  const dist = card.distance(rig.pos)
  c.check(`${tag}: card 1.2 m away`, input, Math.abs(dist - 120) < 4, `${dist.toFixed(1)} cm`)
  const a = angleDeg(card.sub(rig.pos), ref.sub(rig.pos))
  c.check(`${tag}: card 10 deg from its reference direction`, input, Math.abs(a - 10) < 1.5, `${a.toFixed(1)} deg`)
  const lc = camLocal(rig, card)
  const lr = camLocal(rig, ref)
  c.check(`${tag}: card is to the right`, input, lc.x > lr.x, `card x ${lc.x.toFixed(3)} vs ref x ${lr.x.toFixed(3)}`)
  c.check(`${tag}: card at the reference's gaze height`, input, Math.abs(lc.y - lr.y) < 0.02, `card y ${lc.y.toFixed(3)} vs ref y ${lr.y.toFixed(3)}`)
  const f = facesCamera(findSceneObjectByName("InfoCard") ?? main.infoCard.sceneObject, rig.pos, 8)
  c.check(`${tag}: card faces the user`, input, f.ok, `${f.deg.toFixed(1)} deg`)
}

@component
export class SH_N_CardFollow extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("n_card_follow")
    const main = getMain()
    await waitReady(main, c)
    const rig = new CameraRig(this)
    try {
      // A. Look at VS93, tap it (real input): card beside the plane.
      const p = main.getSkyObjectWorldPos("VS93")
      rig.lookAt(p.add(new vec3(0, 0, 0)))
      await sleep(400)
      c.check("precondition: looking at VS93", "test hook", angleDeg(rig.forward, p.sub(rig.pos)) < 1)
      const it = new SkyHangarLeafInteractor()
      await it.triggerChecked(c, requireInteractable("SkyMarker_VS93"), "SkyMarker_VS93")
      await waitUntil(() => main.isCardVisible(), 1500)
      await sleep(1200)
      c.check("card open for VS93", "real input", main.getCardFlightId() === "VS93")
      checkPlacement(c, main, rig, p, "beside plane", "real input")

      // B. Turn 25 deg right: card follows and is back in view, facing the user.
      const yp = rig.yawPitch()
      const offset0 = camLocal(rig, main.getCardWorldPos())
      rig.lookYawPitch(yp.x + 25, yp.y)
      let sawFollow = false
      const t0 = getTime()
      while (getTime() - t0 < 0.4) {
        if (main.isCardFollowing()) sawFollow = true
        await nextFrame()
      }
      c.check("after a 25 deg turn the card starts following (isCardFollowing)", "test hook", sawFollow)
      await sleep(1500)
      const offset1 = camLocal(rig, main.getCardWorldPos())
      const drift = angleDeg(offset0, offset1)
      c.check("~1.5 s later the card is back at the same spot in view", "test hook", drift < 2, `${drift.toFixed(2)} deg from its spot`)
      c.check("card in view (< 20 deg from view centre)", "test hook", angleDeg(rig.forward, main.getCardWorldPos().sub(rig.pos)) < 20,
        `${angleDeg(rig.forward, main.getCardWorldPos().sub(rig.pos)).toFixed(1)} deg`)
      c.check("card settled (not following)", "test hook", !main.isCardFollowing())
      const f = facesCamera(main.infoCard.sceneObject, rig.pos, 8)
      c.check("card faces the user after the turn", "test hook", f.ok, `${f.deg.toFixed(1)} deg`)

      // C. Tap elsewhere closes it (real pinch on nothing).
      c.check("card still open before tapping elsewhere", "inspection", main.isCardVisible())
      await it.pinchNothing(60)
      await sleep(200)
      c.check("tap elsewhere (pinch on nothing) closes the card", "real input", !main.isCardVisible())
      main.closeCard()
      await sleep(300)

      // D. Plane far off-centre (> 20 deg): open at view centre (+10 deg right).
      rig.lookYawPitch(0, 0)
      await sleep(400)
      const off = angleDeg(rig.forward, main.getSkyObjectWorldPos("DL31").sub(rig.pos))
      c.check("precondition: DL31 is > 20 deg off-centre", "test hook", off > 20, `${off.toFixed(0)} deg`)
      main.tapSkyObject("DL31")
      await waitUntil(() => main.isCardVisible(), 1500)
      await sleep(1200)
      checkPlacement(c, main, rig, rig.pos.add(rig.forward.uniformScale(400)), "off-centre plane -> view centre", "test hook")
    } finally {
      rig.restore()
    }
    c.finish()
  }
}
