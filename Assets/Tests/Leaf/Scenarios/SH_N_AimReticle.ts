// Round 2 item 1: aim reticle (four corner brackets + label block) only for the aimed plane:
// callsign, airline code + type, "ORIGIN > DEST", "Departed h:mm ago · Arriving in h:mm".
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, countChildrenWithPrefix, SkyHangarLeafInteractor, requireInteractable} from "../SkyHangarTestKit"
import {infoOf} from "../SkyHangarFlows"
import {SkyHangarMain} from "../../../Scripts/SkyHangarMain"

function hm(min: number): string {
  const m = Math.max(0, Math.round(min))
  return Math.floor(m / 60) + ":" + (m % 60 < 10 ? "0" : "") + (m % 60)
}

function checkReticleFor(c: Checks, main: SkyHangarMain, id: string, tag: string): void {
  const i = infoOf(id)
  const ret = findSceneObjectByName("AimReticle")
  c.check(`${tag}: reticle visible`, "real input", main.isAimReticleVisible() && !!ret && ret.isEnabledInHierarchy)
  if (ret) {
    const d = ret.getTransform().getWorldPosition().distance(main.getSkyObjectWorldPos(id))
    c.check(`${tag}: reticle frames ${id}`, "real input", d < 1, `${d.toFixed(2)} cm from marker`)
  }
  const txt = main.getAimReticleText()
  print(`[SH-TEST] reticle text ${id} = "${txt}"`)
  if (!i) return
  c.includes(`${tag}: callsign`, "real input", txt, i.callsign)
  c.includes(`${tag}: airline code + type`, "real input", txt, i.airlineIcao + " · " + i.aircraftType)
  c.includes(`${tag}: ORIGIN > DEST`, "real input", txt, i.origin + " > " + i.destination)
  c.includes(`${tag}: Departed ... ago`, "real input", txt, "Departed " + hm((i as any).departedAgoMin) + " ago")
  c.includes(`${tag}: Arriving in ...`, "real input", txt, "Arriving in " + hm((i as any).arrivingInMin))
  const lbl = findSceneObjectByName("AimReticleLabel")
  c.check(`${tag}: AimReticleLabel shown`, "real input", !!lbl && lbl.isEnabledInHierarchy && lbl.getTransform().getWorldScale().x > 0.01)
}

@component
export class SH_N_AimReticle extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("n_aim_reticle")
    const main = getMain()
    await waitReady(main, c)
    const ret = findSceneObjectByName("AimReticle")
    c.check("AimReticle has four corner brackets", "inspection", !!ret && countChildrenWithPrefix(ret, "Corner_") === 4)
    c.check("no reticle before aiming", "inspection", !main.isAimReticleVisible() && main.getAimReticleText() === "", `text "${main.getAimReticleText()}"`)

    const it = new SkyHangarLeafInteractor()
    await it.beginHover(requireInteractable("SkyMarker_VS93"))
    await sleep(400)
    checkReticleFor(c, main, "VS93", "aim VS93")
    await it.endHover()
    await sleep(300)
    c.check("look away: reticle and label hidden", "real input", !main.isAimReticleVisible() && main.getAimReticleText() === "", `text "${main.getAimReticleText()}"`)

    await it.beginHover(requireInteractable("SkyMarker_DL31"))
    await sleep(400)
    checkReticleFor(c, main, "DL31", "aim DL31")
    c.check("only the aimed plane's data is shown (no VS93 text)", "real input", main.getAimReticleText().indexOf("VIR93") < 0)
    await it.endHover()
    c.finish()
  }
}
