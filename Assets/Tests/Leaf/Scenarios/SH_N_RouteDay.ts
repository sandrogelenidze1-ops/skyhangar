// Day colours of the route lines and trails: amber, thicker, more opaque by day; the current colours at night (RouteDayChecks.ts, also run in Node).
// Plus a live read of the sky controller's day amount.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {Checks, getMain, waitReady} from "../SkyHangarTestKit"
import {runRouteDayChecks} from "../RouteDayChecks"

@component
export class SH_N_RouteDay extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("n_route_day")
    const main = getMain()
    await waitReady(main, c)
    runRouteDayChecks(c, (t) => print(t))
    const d = main.sky.getDayAmount()
    print(`[SH-TEST] route day amount now: ${d.toFixed(2)}`)
    c.check("the sky controller's day amount is valid (0 at night .. 1 by day)", "inspection", d >= 0 && d <= 1, d.toFixed(2))
    c.finish()
  }
}
