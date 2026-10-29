// Criterion 2b: a quick pinch (real SIK trigger on SkyMarker_VS93) opens the card with airline,
// flight number, origin -> destination, takeoff/landing times, aircraft type, altitude and speed.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, waitUntil, SkyHangarLeafInteractor, requireInteractable} from "../SkyHangarTestKit"
import {checkPlaneCard} from "../SkyHangarFlows"

@component
export class SH_C2_TapCard extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("c2_tap_card")
    const main = getMain()
    await waitReady(main, c)
    c.check("card hidden at start", "inspection", !main.isCardVisible())

    const it = new SkyHangarLeafInteractor()
    await it.trigger(requireInteractable("SkyMarker_VS93"))
    await waitUntil(() => main.isCardVisible(), 1500)
    await sleep(300)
    checkPlaneCard(c, main, "VS93", "real input", "quick pinch VS93")
    c.check("quick pinch did not pull the plane", "real input", main.getHeldState() === "none", `state=${main.getHeldState()}`)
    c.check("trail pinned for the open card", "real input", main.getTrailFlightId() === "VS93", `trail="${main.getTrailFlightId()}"`)

    // Close with the card's own Close button (real input).
    await sleep(600)
    await it.trigger(requireInteractable("InfoCardClose"))
    const closed = await waitUntil(() => !main.isCardVisible(), 1500)
    c.check("Close button closes the card", "real input", closed)

    // Hook path for another plane.
    main.tapSkyObject("DL31")
    await sleep(500)
    checkPlaneCard(c, main, "DL31", "test hook", "tapSkyObject DL31")
    c.finish()
  }
}
