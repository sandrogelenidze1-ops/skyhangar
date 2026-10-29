// Round 1 item 6: full-route trails. Plane: horizon -> plane -> horizon with origin/destination codes;
// helicopter: past trail only, no landing path, no labels; satellite: an orbit arc, no labels.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, angleDeg, fmtVec, SkyHangarLeafInteractor, requireInteractable} from "../SkyHangarTestKit"
import {trailSegments} from "../SkyHangarFlows"

@component
export class SH_N_TrailRoute extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("n_trail_route")
    const main = getMain()
    await waitReady(main, c)
    const center = () => main.sky.sceneObject.getTransform().getWorldPosition()
    const R = main.sky.skyDomeRadiusCm

    // Plane, real hover.
    const it = new SkyHangarLeafInteractor()
    await it.beginHover(requireInteractable("SkyMarker_BA169"))
    await sleep(400)
    c.check("plane BA169: trail shown", "real input", main.getTrailFlightId() === "BA169", `got "${main.getTrailFlightId()}"`)
    c.check("plane: 72 path points", "real input", main.getTrailPointCount() === 72, `${main.getTrailPointCount()}`)
    c.check("plane: has a landing path ahead", "real input", main.trailHasLandingPath())
    const l = main.getTrailEndpointLabels()
    c.check("plane: end labels [LHR, MIA-style dest code]", "real input", l.length === 2 && l[0] === "LHR" && l[1].length === 3, JSON.stringify(l))
    const o = main.sky.getTrailOriginPos().sub(center())
    const d = main.sky.getTrailDestPos().sub(center())
    c.check("plane: route starts at the horizon", "inspection", Math.abs(o.y) < 3, `origin ${fmtVec(o)}`)
    c.check("plane: route ends at the other horizon", "inspection", Math.abs(d.y) < 3, `dest ${fmtVec(d)}`)
    c.check("plane: route ends are on opposite sides of the sky (> 60 deg apart)", "inspection", angleDeg(o, d) > 60, `${angleDeg(o, d).toFixed(0)} deg`)
    const segs = trailSegments()
    const offDome = segs.solid.concat(segs.dots).filter((s) => Math.abs(s.pos.sub(center()).length - R) > 3).length
    c.check("plane: every segment lies on the sky dome", "inspection", offDome === 0, `${offDome} off-dome of ${segs.solid.length + segs.dots.length}`)
    await it.endHover()
    await sleep(300)

    // Helicopter, hook.
    main.aimAt("VLZ05")
    await sleep(300)
    c.check("helicopter VLZ05: trail shown", "test hook", main.getTrailFlightId() === "VLZ05")
    c.check("helicopter: 24 path points", "test hook", main.getTrailPointCount() === 24, `${main.getTrailPointCount()}`)
    c.check("helicopter: no landing path", "test hook", !main.trailHasLandingPath())
    const hs = trailSegments()
    c.check("helicopter: past trail only (solid, no dots ahead)", "inspection", hs.solid.length > 5 && hs.dots.length === 0, `${hs.solid.length} solid / ${hs.dots.length} dots`)
    c.check("helicopter: no route labels", "test hook", main.getTrailEndpointLabels().length === 0, JSON.stringify(main.getTrailEndpointLabels()))

    // Satellite, hook.
    main.aimAt("SAT25544")
    await sleep(300)
    c.check("satellite SAT25544: trail shown", "test hook", main.getTrailFlightId() === "SAT25544")
    c.check("satellite: 60 orbit-arc points", "test hook", main.getTrailPointCount() === 60, `${main.getTrailPointCount()}`)
    const ss = trailSegments()
    c.check("satellite: arc drawn both behind and ahead", "inspection", ss.solid.length > 5 && ss.dots.length > 5, `${ss.solid.length} solid / ${ss.dots.length} dots`)
    const so = main.sky.getTrailOriginPos().sub(center())
    const sd = main.sky.getTrailDestPos().sub(center())
    c.check("satellite: arc stays high in the sky (ends above the horizon)", "inspection", so.y > 50 && sd.y > 50, `${fmtVec(so)} / ${fmtVec(sd)}`)
    c.check("satellite: no airport labels", "test hook", main.getTrailEndpointLabels().length === 0, JSON.stringify(main.getTrailEndpointLabels()))
    c.check("satellite: no landing path", "test hook", !main.trailHasLandingPath())
    main.aimAt("")
    c.finish()
  }
}
