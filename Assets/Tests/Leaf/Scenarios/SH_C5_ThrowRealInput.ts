// Criterion 5 (real SIK input): pinch-and-hold the GUIDO helicopter marker, keep the ray on the sky
// (away from the pad) and let go -> thrown -> returning -> back at the hand, rotor spinning.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, waitUntil, SkyHangarLeafInteractor, requireInteractable} from "../SkyHangarTestKit"
import {throwFlow} from "../SkyHangarFlows"

@component
export class SH_C5_ThrowRealInput extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("c5_throw_real")
    const main = getMain()
    await waitReady(main, c)
    const it = new SkyHangarLeafInteractor()
    await it.pinchDown(requireInteractable("SkyMarker_GUIDO"))
    const held = await waitUntil(() => main.getHeldState() === "held", 3000)
    c.check("pinch-hold on GUIDO brings it to the hand (held)", "real input", held, `state=${main.getHeldState()}`)
    await sleep(300)
    await throwFlow(c, main, "GUIDO", "real input", async () => { await it.releasePinch() }, true)
    c.finish()
  }
}
