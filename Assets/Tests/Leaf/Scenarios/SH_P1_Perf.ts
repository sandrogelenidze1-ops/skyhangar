// Task M7 step 5: render census. Walks the live scene and prints draw calls (enabled mesh visuals), triangles, unique materials
// and textures per view (sky / radar / hangar) with the heaviest contributors, plus the sky model-cap and low-detail rules.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {takeCensus, censusLine, Census} from "../../../Scripts/SkyHangarPerf"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady} from "../SkyHangarTestKit"

@component
export class SH_P1_Perf extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("p1_perf")
    const main = getMain()
    await waitReady(main, c)
    const results: {[mode: string]: Census} = {}
    for (const mode of ["sky", "radar", "hangar"] as const) {
      if (mode === "sky") main.openSky()
      else if (mode === "radar") main.openRadar()
      else main.openHangar()
      await sleep(800)
      results[mode] = takeCensus()
      print(censusLine(mode, results[mode]))
    }
    main.openSky()
    c.check("census ran for sky / radar / hangar", "inspection", results.sky.calls > 0 && results.radar.calls > 0 && results.hangar.calls > 0)
    c.finish()
  }
}
