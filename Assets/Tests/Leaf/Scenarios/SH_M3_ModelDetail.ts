// Task M3: model detail checks on the pure geometry (see ModelDetailChecks.ts): airliner windows, cockpit panels, helicopter glazing,
// satellite thickness and back detail.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {Checks} from "../SkyHangarTestKit"
import {runModelDetailChecks} from "../ModelDetailChecks"

@component
export class SH_M3_ModelDetail extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("m3_model_detail")
    runModelDetailChecks(c, (t) => print(t))
    c.finish()
  }
}
