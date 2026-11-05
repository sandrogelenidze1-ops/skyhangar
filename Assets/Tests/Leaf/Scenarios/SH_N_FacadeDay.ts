// Day look of the close buildings: the night palette is the reference, the day is the same hues, a touch brighter and desaturated, hazier with distance
// (FacadeDayChecks.ts, also run in Node). Only the colour maths is checked here; the Preview shows the result.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {Checks} from "../SkyHangarTestKit"
import {runFacadeDayChecks} from "../FacadeDayChecks"

@component
export class SH_N_FacadeDay extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("n_facade_day")
    runFacadeDayChecks(c, (t) => print(t))
    c.finish()
  }
}
