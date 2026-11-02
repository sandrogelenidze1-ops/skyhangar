// Criterion 2/3 boundary: tap-vs-pull discrimination with real SIK input timing.
// Lens rule (SkyHangarInput: TAP_MAX_SECONDS = 0.15, TAP_MAX_MOVE_CM = 1): release in < 0.15 s with < 1 cm of
// hand movement = tap (card); anything longer or further = drag / hold (pull, model comes to the hand).
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, waitUntil, SkyHangarLeafInteractor, requireInteractable} from "../SkyHangarTestKit"

@component
export class SH_C2_TapVsHold extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("c2_tap_vs_hold")
    const main = getMain()
    await waitReady(main, c)
    const it = new SkyHangarLeafInteractor()

    // 60 ms pinches -> taps (tap 1 pins the vehicle, tap 2 opens its card).
    await it.pinchFor(requireInteractable("SkyMarker_DL31"), 60)
    await sleep(300)
    c.check("first 60 ms pinch is a tap (no pull)", "real input", main.getHeldState() === "none" && !main.isCardVisible(), `state=${main.getHeldState()}`)
    await it.pinchFor(requireInteractable("SkyMarker_DL31"), 60)
    await waitUntil(() => main.isCardVisible(), 1000)
    c.check("60 ms pinch opens the card", "real input", main.isCardVisible() && main.getCardFlightId() === "DL31", `card="${main.getCardFlightId()}"`)
    c.check("60 ms pinch does not pull", "real input", main.getHeldState() === "none", `state=${main.getHeldState()}`)
    main.closeCard()
    await sleep(400)

    // 700 ms pinch -> pull (released during the fly-in, so it settles in the hand).
    await it.pinchFor(requireInteractable("SkyMarker_JJ8084"), 700)
    await sleep(200)
    c.check("700 ms pinch does not open a card", "real input", !main.isCardVisible(), `card="${main.getCardFlightId()}"`)
    c.check("700 ms pinch pulls JJ8084", "real input", main.getHeldObjectId() === "JJ8084", `held="${main.getHeldObjectId()}" state=${main.getHeldState()}`)
    const settled = await waitUntil(() => main.getHeldState() === "resting", 2000)
    c.check("released mid fly-in -> model settles in the hand (resting)", "real input", settled, `state=${main.getHeldState()}`)
    c.finish()
  }
}
