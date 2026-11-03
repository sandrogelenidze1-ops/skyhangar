// N1: the menu is three toggle buttons (Routes, Radar, Hangar) and no Sky button. Radar / Hangar are panels (opening one closes the
// other; tapping the open one returns to the sky). Routes is an overlay on the sky view whose state persists across panels; tapping
// it while a panel is open closes the panel and shows the sky with routes on.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, SkyHangarLeafInteractor, requireInteractable} from "../SkyHangarTestKit"

@component
export class SH_N1_MenuToggles extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("n1_menu_toggles")
    const main = getMain()
    await waitReady(main, c)
    const it = new SkyHangarLeafInteractor()
    const lit = (n: string) => {
      const so = findSceneObjectByName("MenuActive_" + n)
      return !!so && so.getTransform().getLocalScale().x > 0.5
    }
    const tap = async (n: string) => {
      await it.trigger(requireInteractable("MenuButton_" + n))
      await sleep(350)
    }

    c.check("no Sky button", "inspection", !findSceneObjectByName("MenuButton_Sky"))
    c.check("no old All routes button or label", "inspection", !findSceneObjectByName("AllRoutesButton") && !findSceneObjectByName("AllRoutesTip"))
    const xs = ["Routes", "Radar", "Hangar"].map((n) => findSceneObjectByName("MenuButton_" + n)?.getTransform().getWorldPosition())
    c.check("Routes, Radar, Hangar buttons exist", "inspection", xs.every((p) => !!p))
    c.check("start: sky home, nothing lit", "inspection", main.getMode() === "sky" && !lit("Routes") && !lit("Radar") && !lit("Hangar") && !main.isAllRoutesOn())

    await tap("Routes")
    c.check("Routes on: sky stays, routes shown, Routes lit", "real input", main.getMode() === "sky" && main.isAllRoutesOn() && lit("Routes"))
    await tap("Radar")
    c.check("Radar opens; Routes stays on and lit", "real input", main.getMode() === "radar" && main.isRadarVisible() && lit("Radar") && lit("Routes") && main.isAllRoutesOn())
    await tap("Hangar")
    c.check("Hangar opens and closes Radar", "real input", main.getMode() === "hangar" && main.isHangarVisible() && !main.isRadarVisible() && lit("Hangar") && !lit("Radar"))
    await tap("Hangar")
    c.check("tapping the open Hangar returns to the sky", "real input", main.getMode() === "sky" && !main.isHangarVisible() && !lit("Hangar") && main.isAllRoutesOn() && lit("Routes"))
    await tap("Routes")
    c.check("Routes off again", "real input", main.getMode() === "sky" && !main.isAllRoutesOn() && !lit("Routes"))
    await tap("Radar")
    c.check("Radar open, routes off", "real input", main.getMode() === "radar" && !main.isAllRoutesOn())
    await tap("Routes")
    c.check("Routes while Radar is open: panel closes, sky with routes on", "real input", main.getMode() === "sky" && !main.isRadarVisible() && main.isAllRoutesOn() && lit("Routes") && !lit("Radar"))
    await tap("Radar")
    await tap("Radar")
    c.check("tapping the open Radar returns to the sky", "real input", main.getMode() === "sky" && !main.isRadarVisible() && !lit("Radar"))
    await tap("Routes")
    c.check("Routes off at the end", "real input", !main.isAllRoutesOn() && !lit("Routes"))
    c.finish()
  }
}
