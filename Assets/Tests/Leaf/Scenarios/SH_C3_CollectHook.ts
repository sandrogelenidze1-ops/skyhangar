// Criterion 3 (test hooks): pull a plane (FR935Q) and a satellite (SAT48274), neither pre-filled on the shelf, -> held model in livery
// colours + pad fades in; over pad -> glow; release over pad -> "Collected", +1 count, +1 shelf,
// new plaque with airline, flight, route, place and time.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, waitUntil} from "../SkyHangarTestKit"
import {collectFlow} from "../SkyHangarFlows"
import {SkyHangarMain} from "../../../Scripts/SkyHangarMain"

async function pullAndCollect(c: Checks, main: SkyHangarMain, id: string, first: boolean): Promise<void> {
  c.check(`pad hidden before pulling ${id}`, "inspection", !main.isPadVisible())
  const ok = main.pullSkyObject(id)
  c.check(`pullSkyObject(${id}) accepted`, "test hook", ok)
  const held = await waitUntil(() => main.getHeldState() === "held", 2500)
  c.check(`${id} arrives in the hand (held)`, "test hook", held, `state=${main.getHeldState()}`)
  await sleep(300)
  await collectFlow(c, main, id, "test hook",
    async () => { main.moveHeldOverPad(); await nextFrame() },
    async () => { main.releaseHeld(true) },
    first)
  await sleep(2500) // let the stamp + pad fade out
}

@component
export class SH_C3_CollectHook extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("c3_collect_hook")
    const main = getMain()
    await waitReady(main, c)
    await pullAndCollect(c, main, "FR935Q", true)
    await pullAndCollect(c, main, "SAT48274", false)
    c.finish()
  }
}
