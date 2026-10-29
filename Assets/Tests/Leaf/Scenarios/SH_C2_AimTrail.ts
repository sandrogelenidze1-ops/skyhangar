// Criterion 2a (+ round 1 item 6 / round 2 item 2): aiming at a plane shows its trail, solid with a
// fade behind and dotted with a fade ahead, with origin and destination codes at the far route ends.
// Real SIK hover on the marker's Interactable, then the aimAt() hook for a second plane.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, SkyHangarLeafInteractor, requireInteractable, InputKind} from "../SkyHangarTestKit"
import {SkyHangarMain} from "../../../Scripts/SkyHangarMain"
import {trailSegments} from "../SkyHangarFlows"

function checkTrailLayout(c: Checks, main: SkyHangarMain, id: string, input: InputKind): void {
  const marker = main.getSkyObjectWorldPos(id)
  const {solid, dots} = trailSegments()
  c.check("solid (behind) and dotted (ahead) segments drawn", input, solid.length > 5 && dots.length > 5, `${solid.length} solid / ${dots.length} dots`)
  if (solid.length < 3 || dots.length < 3 || !marker) return
  const sGap = solid[1].pos.distance(solid[0].pos)
  const dGap = dots[1].pos.distance(dots[0].pos)
  c.check("behind part is continuous (segment length >= spacing)", "inspection", solid[0].len >= sGap * 0.9, `len ${solid[0].len.toFixed(1)} spacing ${sGap.toFixed(1)}`)
  c.check("ahead part is dotted (dot length < 60% of spacing)", "inspection", dots[0].len < dGap * 0.6, `len ${dots[0].len.toFixed(1)} spacing ${dGap.toFixed(1)}`)
  const sLast = solid[solid.length - 1].pos
  const dFirst = dots[0].pos
  c.check("trail passes through the aircraft (solid ends / dots start at the marker)", "inspection",
    sLast.distance(marker) < sGap * 1.5 && dFirst.distance(marker) < dGap * 1.5, `${sLast.distance(marker).toFixed(1)} / ${dFirst.distance(marker).toFixed(1)} cm`)
  c.check("solid fades away from the plane (alpha rises toward it)", "inspection", solid[0].alpha < solid[solid.length - 1].alpha - 0.3,
    `${solid[0].alpha.toFixed(2)} -> ${solid[solid.length - 1].alpha.toFixed(2)}`)
  c.check("dots fade toward the destination (alpha falls)", "inspection", dots[dots.length - 1].alpha < dots[0].alpha - 0.3,
    `${dots[0].alpha.toFixed(2)} -> ${dots[dots.length - 1].alpha.toFixed(2)}`)
  const o = main.sky.getTrailOriginPos()
  const cam = main.cameraObject.getTransform().getWorldPosition()
  const sc = solid[Math.floor(solid.length / 2)].pos
  const dc = dots[Math.floor(dots.length / 2)].pos
  c.check("solid part is on the origin side (behind)", "inspection", sc.distance(o) < dc.distance(o))
  c.check("trail thin (width <= 2 cm on a 4 m dome)", "inspection", solid[0].width <= 2, `${solid[0].width.toFixed(2)} cm`)
  void cam
}

@component
export class SH_C2_AimTrail extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("c2_aim_trail")
    const main = getMain()
    await waitReady(main, c)
    c.check("no trail before aiming", "inspection", !main.isTrailVisible())

    const it = new SkyHangarLeafInteractor()
    await it.beginHover(requireInteractable("SkyMarker_VS93"))
    await sleep(400)
    c.check("aimed id = VS93", "real input", main.getAimedId() === "VS93", `got "${main.getAimedId()}"`)
    c.check("trail visible", "real input", main.isTrailVisible())
    c.check("trail is for VS93", "real input", main.getTrailFlightId() === "VS93", `got "${main.getTrailFlightId()}"`)
    const lbl = main.getTrailEndpointLabels()
    c.check("trail end labels are [LHR, CUN]", "real input", lbl.length === 2 && lbl[0] === "LHR" && lbl[1] === "CUN", JSON.stringify(lbl))
    checkTrailLayout(c, main, "VS93", "real input")
    await it.endHover()
    await sleep(300)
    c.check("look away: trail hidden", "real input", !main.isTrailVisible() && main.getAimedId() === "", `trail="${main.getTrailFlightId()}"`)

    main.aimAt("DL31")
    await sleep(300)
    c.check("aimAt(DL31): trail for DL31", "test hook", main.isTrailVisible() && main.getTrailFlightId() === "DL31", `got "${main.getTrailFlightId()}"`)
    const l2 = main.getTrailEndpointLabels()
    c.check("aimAt(DL31): end labels [LHR, ATL]", "test hook", l2.length === 2 && l2[0] === "LHR" && l2[1] === "ATL", JSON.stringify(l2))
    main.aimAt("")
    await sleep(200)
    c.check("aimAt(''): trail hidden", "test hook", !main.isTrailVisible())
    c.finish()
  }
}
