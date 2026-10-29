// Criterion 4: clicking Radar on the menu bar (real SIK trigger on MenuButton_Radar) shows a tilted
// disc with blips, range rings and a rotating sweep; pinching a blip (real trigger on RadarBlip_DL31)
// opens the same card.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, waitUntil, SkyHangarLeafInteractor, requireInteractable, countChildrenWithPrefix, quatAngleDeg, fmtVec} from "../SkyHangarTestKit"
import {cardRows, checkPlaneCard} from "../SkyHangarFlows"

@component
export class SH_C4_Radar extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("c4_radar")
    const main = getMain()
    await waitReady(main, c)

    // Reference card content for DL31 from the sky (hook), to compare with the radar card.
    main.tapSkyObject("DL31")
    await sleep(400)
    const skyRows = cardRows(main)
    main.closeCard()
    await sleep(300)
    c.check("radar hidden at start", "inspection", !main.isRadarVisible())

    const it = new SkyHangarLeafInteractor()
    await it.trigger(requireInteractable("MenuButton_Radar"))
    const opened = await waitUntil(() => main.isRadarVisible(), 1500)
    c.check("menu Radar click switches to radar mode", "real input", opened && main.getMode() === "radar", `mode=${main.getMode()}`)
    await sleep(500)
    const radar = main.radar.sceneObject
    const ws = radar.getTransform().getWorldScale()
    c.check("radar root shown (non-zero scale)", "real input", ws.x > 0.5, `scale ${fmtVec(ws)}`)
    const n = main.getRadarBlipCount()
    c.check("blip count > 0", "real input", n > 0, `blips=${n}`)
    c.check("one RadarBlip_<id> object per blip", "inspection", countChildrenWithPrefix(radar, "RadarBlip_") === n, `${countChildrenWithPrefix(radar, "RadarBlip_")} objects`)
    c.check("3 range rings", "inspection", countChildrenWithPrefix(radar, "RangeRing_") === 3, `${countChildrenWithPrefix(radar, "RangeRing_")}`)
    const sweep = findSceneObjectByName("SweepLine")
    c.check("sweep line exists", "inspection", !!sweep)
    if (sweep) {
      const r0 = sweep.getTransform().getLocalRotation()
      await sleep(500)
      const d = quatAngleDeg(r0, sweep.getTransform().getLocalRotation())
      c.check("sweep rotates over time", "inspection", d > 15, `${d.toFixed(1)} deg in 0.5 s`)
    }
    const disc = main.radar.discRoot
    const up = disc.getTransform().getWorldRotation().multiplyVec3(vec3.up())
    const tilt = (Math.acos(Math.max(-1, Math.min(1, up.dot(vec3.up())))) * 180) / Math.PI
    c.check("disc tilted ~45 deg", "inspection", Math.abs(tilt - 45) < 5, `${tilt.toFixed(1)} deg`)
    const cam = main.cameraObject.getTransform().getWorldPosition()
    const toUser = cam.sub(disc.getTransform().getWorldPosition())
    const flat = new vec3(toUser.x, 0, toUser.z).normalize()
    c.check("disc face tilts toward the user", "inspection", up.dot(flat) > 0.5, `dot=${up.dot(flat).toFixed(2)}`)
    const dist = toUser.length
    c.check("disc placed ~1 m in front", "inspection", dist > 70 && dist < 130, `${dist.toFixed(0)} cm`)

    // Pinch a blip (real input).
    await it.trigger(requireInteractable("RadarBlip_DL31"))
    await waitUntil(() => main.isCardVisible(), 1500)
    await sleep(300)
    checkPlaneCard(c, main, "DL31", "real input", "blip DL31")
    c.check("radar card has the same content as the sky card", "real input", cardRows(main) === skyRows, `radar "${cardRows(main)}" vs sky "${skyRows}"`)

    // Hook path for a second blip.
    main.closeCard()
    await sleep(300)
    c.check("tapRadarBlip(VS93) accepted", "test hook", main.tapRadarBlip("VS93"))
    await sleep(400)
    checkPlaneCard(c, main, "VS93", "test hook", "blip VS93")
    c.finish()
  }
}
