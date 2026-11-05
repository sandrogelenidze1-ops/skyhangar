// Distant skyline silhouette: the pure checks (SkylineChecks.ts, also run in Node), plus what got built in the scene:
// TWO alpha-blended strips (silhouette + lights) under City/Skyline, depth-tested, no depth write, no scripts (nothing per frame).
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
    c.check("exactly two strips: the silhouette and the lights", "inspection", s.getChildrenCount() === 2 && s.getChild(0).name === "Skyline_Strip" && s.getChild(1).name === "Skyline_Lights")
    for (let i = 0; i < s.getChildrenCount(); i++) {
      const strip = s.getChild(i)
      const rmv = strip.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      const p = rmv.mainMaterial.mainPass
      c.check(`${strip.name}: blended, depth test on, depth write off`, "inspection", p.blendMode === BlendMode.Normal && p.depthTest && !p.depthWrite)
      c.check(`${strip.name}: no scripts (nothing per frame)`, "inspection", strip.getComponents("Component.ScriptComponent").length === 0)
    }
    // night only: the lights strip alpha follows the backdrop's night-light amount (0 by day .. 1 at night)
    const la = (s.getChild(1).getComponent("Component.RenderMeshVisual") as RenderMeshVisual).mainMaterial.mainPass.baseColor.a
    const sa = (s.getChild(0).getComponent("Component.RenderMeshVisual") as RenderMeshVisual).mainMaterial.mainPass.baseColor.a
    print(`[SH-TEST] skyline now: lights alpha ${la.toFixed(2)}, silhouette alpha ${sa.toFixed(2)}`)
    c.check("lights alpha and silhouette alpha are valid for the current time of day (lights 0..1, silhouette 0.28..1)", "inspection", la >= 0 && la <= 1 && sa >= 0.27 && sa <= 1.01, `${la.toFixed(2)} / ${sa.toFixed(2)}`)
    // never culled, and always centred on the viewer (horizontally), so it is the same distance away from every side
    for (let i = 0; i < s.getChildrenCount(); i++) {
      const p2 = (s.getChild(i).getComponent("Component.RenderMeshVisual") as RenderMeshVisual).mainMaterial.mainPass
      c.check(`${s.getChild(i).name}: frustum culling disabled (huge user AABB)`, "inspection", p2.frustumCullMode === FrustumCullMode.UserDefinedAABB && p2.frustumCullMax.x >= 20000 && p2.frustumCullMin.x <= -20000)
    }
    const camObj = findSceneObjectByName("Camera Object")
    if (camObj) {
      await waitUntil(() => { const a = camObj.getTransform().getWorldPosition(), b = s.getTransform().getWorldPosition(); return Math.hypot(a.x - b.x, a.z - b.z) < 2 }, 3000)
      const a = camObj.getTransform().getWorldPosition(), b = s.getTransform().getWorldPosition()
      c.check("the skyline is centred on the camera's horizontal position", "inspection", Math.hypot(a.x - b.x, a.z - b.z) < 2, `camera ${a.x.toFixed(0)}, ${a.z.toFixed(0)} vs skyline ${b.x.toFixed(0)}, ${b.z.toFixed(0)}`)
    }
    c.check("no scripts on the Skyline root", "inspection", s.getComponents("Component.ScriptComponent").length === 0)
    c.finish()
  }
}
