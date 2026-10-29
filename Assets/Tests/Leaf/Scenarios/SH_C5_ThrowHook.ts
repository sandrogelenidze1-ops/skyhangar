// Criterion 5 (test hooks): release a plane (DL31) and a helicopter (VLZ05) away from the pad ->
// thrown -> returning -> back at the hand; the helicopter's rotor spins during the throw.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, waitUntil} from "../SkyHangarTestKit"
import {throwFlow} from "../SkyHangarFlows"
import {SkyHangarMain} from "../../../Scripts/SkyHangarMain"

async function pullAndThrow(c: Checks, main: SkyHangarMain, id: string, rotor: boolean): Promise<void> {
  c.check(`pullSkyObject(${id}) accepted`, "test hook", main.pullSkyObject(id))
  const held = await waitUntil(() => main.getHeldState() === "held", 2500)
  c.check(`${id} held`, "test hook", held, `state=${main.getHeldState()}`)
  await sleep(300)
  await throwFlow(c, main, id, "test hook", async () => main.releaseHeld(false), rotor)
}

@component
export class SH_C5_ThrowHook extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("c5_throw_hook")
    const main = getMain()
    await waitReady(main, c)
    await pullAndThrow(c, main, "DL31", false)
    await sleep(500)
    await pullAndThrow(c, main, "VLZ05", true)
    c.finish()
  }
}
