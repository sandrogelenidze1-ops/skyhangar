// Round 1 items 3/4: the Sky return pad.
// Release over the Sky pad -> "returningToSky" -> "none", model gone, marker still in its sky spot
// (and flashes); not collected. Hook path, real-input path (ray swung onto the Sky pad), sendHeldToSky hook.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, waitUntil, recordStates, findChild, InputKind, SkyHangarLeafInteractor, requireInteractable, fmtVec} from "../SkyHangarTestKit"
import {SkyHangarMain} from "../../../Scripts/SkyHangarMain"

async function checkReturnToSky(c: Checks, main: SkyHangarMain, id: string, input: InputKind, release: () => Promise<void>): Promise<void> {
  const home = main.getSkyObjectWorldPos(id)
  const collected0 = main.getCollectedCount()
  const shelf0 = main.getShelfCount()
  const vis = findChild(findSceneObjectByName("SkyMarker_" + id), "Visual")
  let minHomeDist = 1e9
  let maxFlash = 0
  await release()
  const states = await recordStates(() => main.getHeldState(), 2200, () => {
    const h = main.held.getModelObject()
    if (h) minHomeDist = Math.min(minHomeDist, main.held.getModelWorldPos().distance(main.getSkyObjectWorldPos(id)))
    // Flash = glyph brightens after the model has landed (state none), not from hover/pin.
    if (vis && !h && main.getHeldState() === "none") maxFlash = Math.max(maxFlash, vis.getTransform().getLocalScale().x)
  })
  print(`[SH-TEST] ${id} sky-return states: ${states.join(" -> ")}; closest to home ${minHomeDist.toFixed(1)} cm`)
  const iR = states.indexOf("returningToSky")
  c.check("state goes returningToSky -> none", input, iR >= 0 && states.lastIndexOf("none") > iR, states.join(" -> "))
  c.check("model flies back to its place in the sky (< 30 cm from marker)", input, minHomeDist < 30, `${minHomeDist.toFixed(1)} cm`)
  c.check("model removed from view", input, main.held.getModelObject() === null && main.getHeldObjectId() === "")
  const now = main.getSkyObjectWorldPos(id)
  c.check("marker still in its sky spot", input, !!home && !!now && now.distance(home) < 1, `${home ? fmtVec(home) : "?"} -> ${now ? fmtVec(now) : "?"}`)
  c.check("marker enabled in the sky", input, findSceneObjectByName("SkyMarker_" + id).isEnabledInHierarchy)
  c.check("marker flashes when the model arrives", input, maxFlash > 1.05, `max glyph scale ${maxFlash.toFixed(2)}`)
  c.check("sending to sky does not collect", input, main.getCollectedCount() === collected0 && main.getShelfCount() === shelf0)
  await waitUntil(() => !main.isSkyPadVisible(), 2000)
  c.check("pads fade out afterwards", input, !main.isSkyPadVisible() && !main.isPadVisible())
}

@component
export class SH_N_SkyPad extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("n_sky_pad")
    const main = getMain()
    await waitReady(main, c)
    c.check("Sky pad hidden while nothing is held", "inspection", !main.isSkyPadVisible())

    // 1. Hooks.
    c.check("pullSkyObject(VS93)", "test hook", main.pullSkyObject("VS93"))
    await waitUntil(() => main.getHeldState() === "held", 2500)
    await waitUntil(() => main.isSkyPadVisible(), 1500)
    c.check("Sky pad shown while holding", "test hook", main.isSkyPadVisible())
    const sky = findSceneObjectByName("SkyReturnPad")
    c.check("SkyReturnPad has the up-arrow glyph", "inspection", !!sky && !!findChild(sky, "SkyUpArrowGlyph"))
    const hangar = findSceneObjectByName("HangarPad")
    c.check("HangarPad has the hangar glyph (no X)", "inspection", !!hangar && !!findChild(hangar, "HangarGlyph") && !findChild(hangar, "PadMarkA"))
    const lab = main.labels as any
    c.check('pads labelled "Hangar" and "Sky"', "inspection", lab.arePadLabelsVisible() && lab.hangarPadLabel.big.text === "Hangar" && lab.skyPadLabel.big.text === "Sky",
      `${lab.hangarPadLabel?.big?.text} / ${lab.skyPadLabel?.big?.text}`)
    const gap = main.held.getSkyPadWorldPos().distance(main.held.getPadWorldPos())
    c.check("Sky pad sits next to the hangar pad (< 30 cm)", "inspection", gap < 30 && gap > 10, `${gap.toFixed(1)} cm`)
    main.moveHeldOverSkyPad()
    await sleep(200)
    c.check("Sky pad glows with the model over it", "test hook", main.isSkyPadGlowing())
    c.check("hangar pad not glowing at the same time", "test hook", !main.isPadGlowing())
    await checkReturnToSky(c, main, "VS93", "test hook", async () => main.releaseHeld())
    await sleep(500)

    // 2. Real input: pinch-hold DL31, swing the ray onto the Sky pad, let go.
    const it = new SkyHangarLeafInteractor()
    await it.pinchDown(requireInteractable("SkyMarker_DL31"))
    const held = await waitUntil(() => main.getHeldState() === "held", 3000)
    c.check("pinch-hold DL31 -> held", "real input", held, `state=${main.getHeldState()}`)
    it.aimRayAt(main.held.getSkyPadWorldPos())
    const glow = await waitUntil(() => main.isSkyPadGlowing(), 1500)
    c.check("ray on the Sky pad -> Sky pad glows", "real input", glow)
    c.check("hangar pad not glowing (nearer pad wins)", "real input", !main.isPadGlowing())
    await checkReturnToSky(c, main, "DL31", "real input", async () => { await it.releasePinch() })
    await sleep(500)

    // 3. The card has no Let go button any more; sendHeldToSky() is the action the Sky pad performs.
    c.check("pullSkyObject(JJ8084)", "test hook", main.pullSkyObject("JJ8084"))
    await waitUntil(() => main.getHeldState() === "held", 2500)
    main.tapSkyObject("JJ8084")
    await waitUntil(() => main.isCardVisible(), 1500)
    await sleep(800)
    c.check("card has no Let go button", "inspection", !findSceneObjectByName("InfoCardLetGo"))
    await checkReturnToSky(c, main, "JJ8084", "test hook", async () => { main.sendHeldToSky() })
    main.closeCard()
    c.finish()
  }
}
