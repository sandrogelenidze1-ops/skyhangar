// Criterion 3 (real SIK input): pinch-and-hold SkyMarker_DL81 (pull), keep pinching while the ray
// is swung onto the hangar pad, release -> collected.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, waitUntil, SkyHangarLeafInteractor, requireInteractable} from "../SkyHangarTestKit"
import {collectFlow} from "../SkyHangarFlows"

@component
export class SH_C3_CollectRealInput extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("c3_collect_real")
    const main = getMain()
    await waitReady(main, c)
    const it = new SkyHangarLeafInteractor()
    await it.pinchDown(requireInteractable("SkyMarker_DL81"))
    const held = await waitUntil(() => main.getHeldState() === "held", 3000)
    c.check("pinch-hold on DL81 brings it to the hand (held)", "real input", held, `state=${main.getHeldState()} held="${main.getHeldObjectId()}"`)
    c.check("pinch-hold did not open a card", "real input", !main.isCardVisible())
    await sleep(300)
    await collectFlow(c, main, "DL81", "real input",
      async () => { it.aimRayAt(main.held.getPadWorldPos()) },
      async () => { await it.releasePinch() },
      true)
    c.finish()
  }
}
