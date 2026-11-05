// Distant skyline: the pure geometry/atlas checks (SkylineChecks.ts, also run in Node), plus what actually got built in the scene:
// two merged meshes under City/Skyline, opaque and depth-tested, behind the existing far ring, nothing animated per frame.
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

    // scene checks (the backdrop only exists in the editor preview, and builds a moment after the sky)
    let sky: SceneObject | null = null
    await waitUntil(() => {
      try { sky = findSceneObjectByName("Skyline") } catch { sky = null }
      return !!sky
    }, 8000)
    c.check("Skyline object exists under the city", "inspection", !!sky)
    if (!sky) { c.finish(); return }
    const s = sky as SceneObject
    const kids: SceneObject[] = []
    for (let i = 0; i < s.getChildrenCount(); i++) kids.push(s.getChild(i))
    c.check("exactly two merged meshes (towers + beacons)", "inspection", kids.length === 2 && kids.every((k) => !!k.getComponent("Component.RenderMeshVisual")), kids.map((k) => k.name).join(", "))
    for (const k of kids) {
      const rmv = k.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      const p = rmv.mainMaterial.mainPass
      c.check(`${k.name}: opaque, depth write + test on`, "inspection", p.blendMode === BlendMode.Disabled && p.depthWrite && p.depthTest, `blend ${p.blendMode}`)
      c.check(`${k.name}: no scripts (nothing per frame)`, "inspection", k.getComponents("Component.ScriptComponent").length === 0)
    }
    // the towers sit behind the existing buildings: the Skyline root has no scripts of its own either
    c.check("Skyline root has no scripts", "inspection", s.getComponents("Component.ScriptComponent").length === 0)
    c.finish()
  }
}
