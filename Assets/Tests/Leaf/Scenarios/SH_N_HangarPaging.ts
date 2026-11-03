// Hangar holds 12 pre-filled models, shows 3 per page over 4 pages (no permanent plaques; name tag on hover/hold), counter "a–b of n", page dots,
// next/prev buttons (real taps), a sideways pinch-drag on ShelfDragZone (real input), sort toggle
// (real tap) Recent <-> Type (group header per type), models keep rotating.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, waitUntil, findChild, quatAngleDeg, SkyHangarLeafInteractor, requireInteractable} from "../SkyHangarTestKit"
import {infoOf} from "../SkyHangarFlows"

const PREFILL = ["BA169", "CX257", "SAT25544", "VS93", "DL31", "JJ8084", "LX29K", "EY69W", "AY96W", "BY8AB", "GUIDO", "SAT20580"]

@component
export class SH_N_HangarPaging extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("n_hangar_paging")
    const main = getMain()
    await waitReady(main, c)
    const it = new SkyHangarLeafInteractor()
    const ui = main.shelfUI as any

    await it.triggerChecked(c, requireInteractable("MenuButton_Hangar"), "MenuButton_Hangar")
    await waitUntil(() => main.isHangarVisible(), 1500)
    await sleep(500)
    c.check("menu Hangar click opens the hangar", "real input", main.isHangarVisible() && main.getMode() === "hangar", `mode=${main.getMode()}`)
    c.check("12 pre-filled models", "inspection", main.getShelfCount() === 12, `${main.getShelfCount()}`)
    const ids = main.shelf.getEntries().map((e) => e.info.id)
    c.check("pre-fill list matches the round-1 demo set", "inspection", JSON.stringify(ids) === JSON.stringify(PREFILL), ids.join(","))
    c.check("4 pages of 3", "inspection", main.getHangarPageCount() === 4, `${main.getHangarPageCount()}`)
    c.check("page 1 shows 3 models", "inspection", main.getHangarPage() === 0 && main.getHangarVisibleIds().length === 3, `page ${main.getHangarPage()} [${main.getHangarVisibleIds().join(",")}]`)
    c.check("sort starts at newest", "inspection", main.getHangarSort() === "newest")
    const newest3 = PREFILL.slice().reverse().slice(0, 3)
    c.check("newest first: SAT20580, GUIDO, BY8AB", "inspection", JSON.stringify(main.getHangarVisibleIds()) === JSON.stringify(newest3), main.getHangarVisibleIds().join(","))
    c.check('counter reads "1–3 of 12"', "inspection", main.getHangarCounterText() === "1–3 of 12", `"${main.getHangarCounterText()}"`)
    for (const n of ["ShelfDragZone", "ShelfPrevButton", "ShelfNextButton", "ShelfSortButton", "PageCounter", "PageDots"]) {
      c.check(`${n} exists`, "inspection", !!findSceneObjectByName(n))
    }
    c.check("page dots shown", "inspection", String(ui.getDotsText()).length > 0, `"${ui.getDotsText()}"`)
    c.check("names ready for 3 models", "inspection", ui.getPlaqueCount() === 3, `${ui.getPlaqueCount()}`)
    c.check("each visible model shows its own name tag", "inspection", ui.getTagCount() === 3, `${ui.getTagCount()}`)
    c.check("no permanent plaques in the scene", "inspection", !findSceneObjectByName("Plaque_0"))
    const firstInfo = infoOf(main.getHangarVisibleIds()[0])
    c.includes("first model's name text has its flight", "inspection", String(ui.getPlaqueText(0)), firstInfo ? firstInfo.flight : "?")

    // Models keep rotating.
    const m = findSceneObjectByName("ShelfModel_" + main.getHangarVisibleIds()[0])
    if (m) {
      const r0 = m.getTransform().getLocalRotation()
      await sleep(600)
      const d = quatAngleDeg(r0, m.getTransform().getLocalRotation())
      c.check("shelf models rotate on their own", "inspection", d > 5, `${d.toFixed(1)} deg / 0.6 s`)
    } else c.check("shelf model object found", "inspection", false)

    // Next / prev buttons (real taps).
    await it.triggerChecked(c, requireInteractable("ShelfNextButton"), "ShelfNextButton")
    await sleep(300)
    c.check('Next -> page 2, "4–6 of 12"', "real input", main.getHangarPage() === 1 && main.getHangarCounterText() === "4–6 of 12", `page ${main.getHangarPage()} "${main.getHangarCounterText()}"`)
    c.check("page 2 shows different models", "real input", main.getHangarVisibleIds().every((x) => newest3.indexOf(x) < 0), main.getHangarVisibleIds().join(","))
    await it.triggerChecked(c, requireInteractable("ShelfNextButton"), "ShelfNextButton")
    await sleep(300)
    c.check('Next -> page 3, "7–9 of 12", 3 models', "real input", main.getHangarPage() === 2 && main.getHangarCounterText() === "7–9 of 12" && main.getHangarVisibleIds().length === 3,
      `page ${main.getHangarPage()} "${main.getHangarCounterText()}" [${main.getHangarVisibleIds().join(",")}]`)
    await it.triggerChecked(c, requireInteractable("ShelfNextButton"), "ShelfNextButton")
    await sleep(300)
    c.check('Next -> page 4, "10–12 of 12", 3 models', "real input", main.getHangarPage() === 3 && main.getHangarCounterText() === "10–12 of 12" && main.getHangarVisibleIds().length === 3,
      `page ${main.getHangarPage()} "${main.getHangarCounterText()}" [${main.getHangarVisibleIds().join(",")}]`)
    c.check("4th page: names for 3 models", "real input", ui.getPlaqueCount() === 3, `${ui.getPlaqueCount()}`)
    await it.triggerChecked(c, requireInteractable("ShelfNextButton"), "ShelfNextButton")
    await sleep(300)
    c.check("Next on the last page stays put", "real input", main.getHangarPage() === 3)
    await it.triggerChecked(c, requireInteractable("ShelfPrevButton"), "ShelfPrevButton")
    await sleep(300)
    c.check("Prev -> page 3", "real input", main.getHangarPage() === 2, `page ${main.getHangarPage()}`)

    // Sideways pinch-drag on the shelf (real input). Drag right -> previous page; drag left -> next page.
    const right = main.shelf.sceneObject.getTransform().getWorldRotation().multiplyVec3(vec3.right())
    const zone = requireInteractable("ShelfDragZone")
    await it.pinchDown(zone)
    for (let i = 0; i < 6; i++) { it.shiftRay(right.uniformScale(3)); await sleep(30) }
    await it.releasePinch()
    await sleep(300)
    c.check("drag right on shelf -> previous page (page 2)", "real input", main.getHangarPage() === 1, `page ${main.getHangarPage()}`)
    await it.pinchDown(zone)
    for (let i = 0; i < 6; i++) { it.shiftRay(right.uniformScale(-3)); await sleep(30) }
    await it.releasePinch()
    await sleep(300)
    c.check("drag left on shelf -> next page (page 3)", "real input", main.getHangarPage() === 2, `page ${main.getHangarPage()}`)
    await it.pinchFor(zone, 60)
    await sleep(300)
    c.check("a pinch without sideways movement does not page", "real input", main.getHangarPage() === 2, `page ${main.getHangarPage()}`)

    // Hooks.
    c.check("hangarPrevPage() -> true", "test hook", main.hangarPrevPage() && main.getHangarPage() === 1)
    main.hangarPrevPage() // back to page 1
    c.check("hangarPrevPage() on page 1 -> false", "test hook", !main.hangarPrevPage() && main.getHangarPage() === 0)
    c.check("hangarNextPage() -> true", "test hook", main.hangarNextPage() && main.getHangarPage() === 1)

    // Sort toggle (real tap) -> Type order from page 1, with a small group header per type.
    await it.triggerChecked(c, requireInteractable("ShelfSortButton"), "ShelfSortButton")
    await sleep(300)
    c.check("Sort button -> type", "real input", main.getHangarSort() === "type", main.getHangarSort())
    c.check("sort change resets to page 1", "real input", main.getHangarPage() === 0)
    c.includes("sort button label shows Type", "real input", String(ui.getSortLabel()), "Type")
    c.check("airline sort is gone", "test hook", (main.setHangarSort("airline"), main.getHangarSort() === "type"))
    const all: string[] = []
    const headers: string[] = []
    for (let p = 0; p < main.getHangarPageCount(); p++) {
      main.shelf.setPage(p)
      for (const id of main.getHangarVisibleIds()) all.push(id)
      for (const h of main.shelf.getVisibleGroupHeaders()) if (h) headers.push(h)
    }
    const order = ["plane", "helicopter", "satellite"]
    const kinds = all.map((x) => order.indexOf(infoOf(x)!.kind))
    const grouped = kinds.every((k, i) => i === 0 || kinds[i - 1] <= k)
    c.check("type sort: all 12 models grouped plane, helicopter, satellite across pages", "real input", grouped && all.length === 12, kinds.join(","))
    c.check("type sort: a small header per type group", "inspection", headers.indexOf("Planes") >= 0 && headers.indexOf("Helicopters") >= 0 && headers.indexOf("Satellites") >= 0, headers.join(","))
    main.shelf.setPage(0)
    await sleep(300)
    c.check("type sort: header pill visible on the shelf", "inspection", ui.getHeaderCount() >= 1, `${ui.getHeaderCount()}`)
    main.setHangarSort("newest")
    await sleep(200)
    c.check("setHangarSort(newest) restores newest-first", "test hook", main.getHangarSort() === "newest" && main.getHangarVisibleIds()[0] === "SAT20580", main.getHangarVisibleIds().join(","))
    c.check("Recent order has no group headers", "inspection", main.shelf.getVisibleGroupHeaders().every((h) => !h))

    // Pickup right after a return: the next model can be picked up immediately (no blocked window while the first glides home).
    main.shelf.setPage(0)
    await sleep(300)
    const [idA, idB] = main.getHangarVisibleIds()
    const ap = main as any
    const at = main.shelf.getShelfWorldPos()
    if (main.getHeldState() !== "none") { // an earlier step may have left a model in inspect mode
      ap.onShelfTap({info: null, fromWorld: at})
      await waitUntil(() => main.getHeldState() === "none", 3500)
    }
    ap.onShelfTap({info: infoOf(idA), fromWorld: at})
    await waitUntil(() => main.getHeldState() === "viewing", 3000)
    c.check("first model inspected", "test hook", main.getHeldObjectId() === idA, main.getHeldObjectId())
    ap.onShelfTap({info: null, fromWorld: at}) // any tap while inspecting sends it home
    await sleep(120)
    c.check("first model is gliding home", "test hook", main.getHeldState() === "returningToShelf", main.getHeldState())
    ap.onShelfTap({info: infoOf(idB), fromWorld: at})
    await sleep(150)
    c.check("second model picked up at once", "test hook", main.getHeldObjectId() === idB && main.getHeldState() !== "none", `${main.getHeldObjectId()} / ${main.getHeldState()}`)
    const copyA = findSceneObjectByName("ShelfModel_" + idA)
    c.check("first model is back on its slot (not hidden)", "inspection", !!copyA && copyA.isEnabledInHierarchy)
    await waitUntil(() => main.getHeldState() === "viewing", 3000)
    ap.onShelfTap({info: null, fromWorld: at})
    await waitUntil(() => main.getHeldState() === "none", 3000)
    c.finish()
  }
}
