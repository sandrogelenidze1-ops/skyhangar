// Criterion 4: clicking Radar on the menu bar (real SIK trigger on MenuButton_Radar) shows a tilted
// disc with blips, range rings and a rotating sweep; pinching a blip (real trigger on RadarBlip_DL31)
// opens the same card.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, waitUntil, SkyHangarLeafInteractor, requireInteractable, countChildrenWithPrefix, quatAngleDeg, fmtVec} from "../SkyHangarTestKit"
import {cardRows, checkPlaneCard, infoOf} from "../SkyHangarFlows"

@component
export class SH_C4_Radar extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("c4_radar")
    const main = getMain()
    await waitReady(main, c)

    // Reference card content for DL31 from the sky (hook), to compare with the radar card.
    main.tapSkyObject("DL31") // first tap pins
    await sleep(300)
    main.tapSkyObject("DL31") // second tap opens the card
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
    // Smooth circles: every range ring has at least 96 segments.
    const R = main.radar.diameterCm / 2
    for (const f of [1 / 3, 2 / 3, 1]) {
      const ring = findSceneObjectByName("RangeRing_" + Math.round(R * f))
      const segs = ring ? countChildrenWithPrefix(ring, "Seg_") : 0
      c.check(`range ring ${Math.round(main.radar.rangeKm * f)} km has >= 96 segments`, "inspection", segs >= 96, `${segs}`)
    }
    // Blips move at the real speed and heading, with a short fading trail behind.
    const blip = main.radar.getBlipObject("DL31")
    const dl31 = infoOf("DL31")
    if (blip && dl31) {
      const p0 = blip.getTransform().getLocalPosition()
      await sleep(3000)
      const p1 = blip.getTransform().getLocalPosition()
      const d = p1.sub(p0)
      const expectedCm = ((dl31.speedKt * 1.852) / 3600) * (R / main.radar.rangeKm) * 3
      c.check("blip moves at its real speed", "inspection", d.length > expectedCm * 0.6 && d.length < expectedCm * 1.6, `${d.length.toFixed(3)} cm vs ${expectedCm.toFixed(3)} cm expected in 3 s`)
      const hdg = (dl31.trackDeg * Math.PI) / 180 - (main.radar as any).yawAtOpen
      const want = new vec3(Math.sin(hdg), 0, -Math.cos(hdg))
      const ang = (Math.acos(Math.max(-1, Math.min(1, d.normalize().dot(want)))) * 180) / Math.PI
      c.check("blip moves along its real heading", "inspection", ang < 10, `${ang.toFixed(1)} deg off`)
      const t0 = findSceneObjectByName("BlipTrail_DL31_0")
      const t5 = findSceneObjectByName("BlipTrail_DL31_5")
      const a0 = (t0 && t0.getChild(0)?.getComponent("Component.RenderMeshVisual") as RenderMeshVisual | null)?.mainMaterial.mainPass.baseColor.w ?? -1
      const a5 = (t5 && t5.getChild(0)?.getComponent("Component.RenderMeshVisual") as RenderMeshVisual | null)?.mainMaterial.mainPass.baseColor.w ?? -1
      c.check("blip leaves a short trail that fades", "inspection", !!t0 && !!t5 && t0.isEnabledInHierarchy && a0 > a5 && a5 > 0, `alpha ${a0.toFixed(2)} -> ${a5.toFixed(2)}`)
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
