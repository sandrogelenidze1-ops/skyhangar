// F1: the first-use hint plays once at start (3 steps, ~2.5 s each), sits low (out of the central view),
// dismisses itself on the first real tap, and comes back on a quick double tap of the Sky button.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, waitUntil, SkyHangarLeafInteractor, requireInteractable, angleDeg} from "../SkyHangarTestKit"

@component
export class SH_F1_FirstUseHint extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("f1_first_use_hint")
    const main = getMain()
    await waitReady(main, c)
    main.openSky()
    const bar = main.menuBar
    const started = await waitUntil(() => bar.getHintPlays() >= 1, 8000)
    c.check("hint plays once at start", "inspection", started && bar.getHintPlays() === 1 && bar.isHintVisible(), `plays=${bar.getHintPlays()}`)

    // Finish whatever is running, then re-show with a real quick double tap on Sky.
    bar.dismissHint()
    const plays0 = bar.getHintPlays()
    await sleep(500)
    c.check("hint does not replay by itself", "inspection", !bar.isHintVisible() && bar.getHintPlays() === plays0)
    const it = new SkyHangarLeafInteractor()
    const sky = requireInteractable("MenuButton_Sky")
    await it.triggerChecked(c, sky, "MenuButton_Sky")
    await it.triggerChecked(c, sky, "MenuButton_Sky")
    const shown = await waitUntil(() => bar.isHintVisible(), 1000)
    c.check("double tap on Sky re-shows the hint", "real input", shown && bar.getHintPlays() === plays0 + 1, `plays=${bar.getHintPlays()}`)
    c.check("step 1 text", "inspection", bar.getHintText() === "Look up to find aircraft", bar.getHintText())

    // Low in the view, never in the central view.
    const cam = main.cameraObject.getTransform()
    const toHint = bar.getHintWorldPos()!.sub(cam.getWorldPosition())
    const fwd = cam.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    c.check("hint is well away from the view centre (> 6 deg)", "inspection", angleDeg(toHint, fwd) > 6, `${angleDeg(toHint, fwd).toFixed(1)} deg`)
    c.check("hint sits below the view centre", "inspection", toHint.normalize().y < fwd.y, `y ${toHint.normalize().y.toFixed(2)} vs ${fwd.y.toFixed(2)}`)

    // Steps advance by themselves, about 2.5 s each.
    await sleep(2800)
    c.check("step 2 after ~2.5 s", "inspection", bar.getHintText() === "Aim and pinch to pin it", bar.getHintText())
    await sleep(2500)
    c.check("step 3 after ~5 s", "inspection", bar.getHintText() === "Pinch and drag to the Hangar", bar.getHintText())
    await sleep(2500)
    c.check("hint ends by itself after step 3", "inspection", !bar.isHintVisible())

    // Dismiss on the first real tap.
    bar.showHint()
    await sleep(300)
    c.check("hint showing again", "test hook", bar.isHintVisible())
    const id = main.sky.getInfos()[0].id
    main.tapSkyObject(id)
    await sleep(300)
    c.check("a sky tap dismisses the hint", "test hook", !bar.isHintVisible())
    await sleep(3000)
    c.check("and it stays dismissed", "test hook", !bar.isHintVisible() && bar.getHintPlays() === plays0 + 2, `plays=${bar.getHintPlays()}`)
    main.closeCard()
    main.sky.setPinnedTrail("")
    c.finish()
  }
}
