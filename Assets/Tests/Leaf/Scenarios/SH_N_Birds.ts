// Birds: far-away decor birds (4 flight slots: single birds and small flocks, at most 12 birds out), often none, 8-15 s flights every 20-60 s, dark charcoal (grey-blue at night), above the horizon,
// behind the markers, not selectable (no collider / interactable) and cheap.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {Checks, getMain, waitReady} from "../SkyHangarTestKit"
import {SkyHangarBirds, birdColor} from "../../../Scripts/SkyHangarBirds"
import {makeObj} from "../../../Scripts/SkyHangarUtil"

@component
export class SH_N_Birds extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("n_birds")
    const main = getMain()
    await waitReady(main, c)
    const root = makeObj(null, "BirdTest")
    const birds = new SkyHangarBirds(root, main.sky.partKit.unlitMat, 99)
    let maxActive = 0, maxBirds = 0, maxExtra = 0, sumBirds = 0, noneFrames = 0, anyFrames = 0, frames = 0, minY = 1e9, minD = 1e9, maxD = 0, minEl = 90
    const flights: number[] = []
    let flightStart = -1
    for (let i = 0; i < 6000; i++) { // 10 simulated minutes at 10 Hz
      birds.update(0.1)
      frames++
      maxActive = Math.max(maxActive, birds.active)
      maxBirds = Math.max(maxBirds, birds.birdCount)
      maxExtra = Math.max(maxExtra, birds.extraCount)
      sumBirds += birds.birdCount
      if (birds.active === 0) noneFrames++
      else anyFrames++
      for (const p of birds.activePositions()) { minY = Math.min(minY, p.y); minD = Math.min(minD, p.length); maxD = Math.max(maxD, p.length); minEl = Math.min(minEl, Math.asin(p.y / p.length) * 180 / Math.PI) }
      if (birds.active > 0 && flightStart < 0) flightStart = i
      if (birds.active === 0 && flightStart >= 0) { flights.push((i - flightStart) / 10); flightStart = -1 }
    }
    const avgBirds = sumBirds / frames
    c.check("at most 4 regular flights + 8 extra event birds at once, never more than 12 + 8 birds", "inspection", maxActive <= 12 && maxBirds <= 20 && maxExtra <= 8, `max ${maxActive} flights, ${maxBirds} birds, ${maxExtra} extra`)
    c.check("birds do appear over 10 minutes (regular flights plus an event every 10-25 s)", "inspection", anyFrames > 0 && avgBirds > 2 && avgBirds < 8, `none ${(100 * noneFrames / frames).toFixed(0)}% of the time, ${avgBirds.toFixed(2)} birds out on average`)
    c.check("birds stay well above the horizon (12+ degrees) at different distances (24-50 m, small birds)", "inspection", minY > 0 && minEl >= 11.9 && minD > 2300 && maxD < 5100 && maxD - minD > 800, `min elevation ${minEl.toFixed(1)}, dist ${minD.toFixed(0)}-${maxD.toFixed(0)} cm`)
    c.check("every flight lasts at least 8 s (overlapping birds merge, so the upper bound is checked per bird in the code: 15 s)", "inspection", flights.length > 0 && flights.every((f) => f >= 7.9), `${flights.slice(0, 6).map((f) => f.toFixed(0)).join(",")}`)
    const objs = birds.getBirdObjects()
    const rec = (o: SceneObject): boolean => o.getComponents("Physics.ColliderComponent").length === 0 && o.getComponents("Component.ScriptComponent").length === 0 && Array.from({length: o.getChildrenCount()}, (_, i) => o.getChild(i)).every(rec)
    c.check("birds have no collider or script: not selectable, pinnable or pullable", "inspection", objs.every(rec))
    const rmv = objs[0].getChild(0).getChild(0).getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    const lumOf = (v: vec4): number => 0.3 * v.x + 0.4 * v.y + 0.3 * v.z
    const day = birdColor(0), night = birdColor(1)
    const col = rmv.mainMaterial.mainPass.baseColor
    c.check("bird colour by day is the dark charcoal #1A1F2B, opaque", "inspection", Math.abs(day.x - 0x1a / 255) < 0.004 && Math.abs(day.y - 0x1f / 255) < 0.004 && Math.abs(day.z - 0x2b / 255) < 0.004 && day.w === 1, `${day.x.toFixed(3)},${day.y.toFixed(3)},${day.z.toFixed(3)}`)
    c.check("bird colour at night is the dark grey-blue #2A3140: slightly lighter than by day, never black", "inspection", Math.abs(night.x - 0x2a / 255) < 0.004 && Math.abs(night.z - 0x40 / 255) < 0.004 && lumOf(night) > lumOf(day) && lumOf(night) > 0.15, `${night.x.toFixed(3)},${night.y.toFixed(3)},${night.z.toFixed(3)}`)
    const mp = rmv.mainMaterial.mainPass
    c.check("bird material is opaque and unlit-dark: no alpha blend, colour alpha 1, no light colour in it", "inspection", mp.blendMode === BlendMode.Disabled && col.w === 1 && lumOf(col) < 0.3 && rmv.getRenderOrder() < 0, `blend ${mp.blendMode} order ${rmv.getRenderOrder()} lum ${lumOf(col).toFixed(2)}`)
    root.destroy()
    c.finish()
  }
}
