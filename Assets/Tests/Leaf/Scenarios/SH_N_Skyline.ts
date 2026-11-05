// Distant skyline silhouette: the pure checks (SkylineChecks.ts, also run in Node), plus what got built in the scene:
// ONE alpha-blended strip mesh under City/Skyline, depth-tested, no depth write, no scripts (nothing per frame).
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {findSceneObjectByName} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, waitUntil} from "../SkyHangarTestKit"
import {runSkylineChecks} from "../SkylineChecks"

@component
export class SH_N_Skyline extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("n_skyline")
    const main = getMain()
    await waitReady(main, c)
    runSkylineChecks(c, (t) => print(t))

    let sky: SceneObject | null = null
    await waitUntil(() => {
      try { sky = findSceneObjectByName("Skyline") } catch { sky = null }
      return !!sky
    }, 8000)
    c.check("Skyline object exists under the city", "inspection", !!sky)
    if (!sky) { c.finish(); return }
    const s = sky as SceneObject
    c.check("exactly one mesh object (the silhouette strip)", "inspection", s.getChildrenCount() === 1 && s.getChild(0).name === "Skyline_Strip")
    const strip = s.getChild(0)
    const rmv = strip.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    const p = rmv.mainMaterial.mainPass
    c.check("blended, depth test on, depth write off", "inspection", p.blendMode === BlendMode.Normal && p.depthTest && !p.depthWrite)
    c.check("no scripts on the skyline (nothing per frame)", "inspection", strip.getComponents("Component.ScriptComponent").length === 0 && s.getComponents("Component.ScriptComponent").length === 0)
    c.finish()
  }
}
