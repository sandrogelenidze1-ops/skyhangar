// Drop icons (Hangar + Sky) must never stay open. Sky -> Hangar and Hangar -> Sky for a plane, a helicopter and a satellite,
// rapid repeated drops, the 1.5 s safety timeout, and the mode-change reset. After every sequence both icons must end closed.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Checks, getMain, waitReady, waitUntil} from "../SkyHangarTestKit"
import {SkyHangarMain} from "../../../Scripts/SkyHangarMain"

const closed = (m: SkyHangarMain) => !m.isPadVisible() && !m.isSkyPadVisible()

async function settleClosed(m: SkyHangarMain, ms: number): Promise<boolean> {
  return waitUntil(() => m.getHeldState() === "none" && closed(m), ms)
}

/** Pull from the sky, drop on the Hangar icon (toHangar) or the Sky icon. */
async function skyDrop(c: Checks, m: SkyHangarMain, id: string, toHangar: boolean, wait: boolean): Promise<void> {
  c.check(`${id}: pull accepted`, "test hook", m.pullSkyObject(id))
  await waitUntil(() => m.getHeldState() === "held", 2500)
  if (toHangar) m.moveHeldOverPad()
  else m.moveHeldOverSkyPad()
  await sleep(120)
  m.releaseHeld(toHangar ? true : "sky")
  if (wait) {
    const ok = await settleClosed(m, 3200)
    c.check(`${id}: sky -> ${toHangar ? "Hangar" : "Sky"} ends with both icons closed`, "test hook", ok, `state=${m.getHeldState()} hangar=${m.isPadVisible()} sky=${m.isSkyPadVisible()}`)
  }
}

/** Pull a shelf model into the hand, release it over the Sky icon ("Release") or the Hangar icon (back to its slot). */
async function hangarDrop(c: Checks, m: SkyHangarMain, id: string, toSky: boolean, wait: boolean): Promise<void> {
  c.check(`${id}: shelf pull accepted`, "test hook", m.inspectShelfObject(id))
  await waitUntil(() => m.getHeldState() === "held", 2500)
  if (toSky) m.moveHeldOverSkyPad()
  else m.moveHeldOverPad()
  await sleep(120)
  m.releaseHeld(toSky ? "sky" : true)
  if (wait) {
    const ok = await settleClosed(m, 3200)
    c.check(`${id}: Hangar -> ${toSky ? "Sky" : "Hangar slot"} ends with both icons closed`, "test hook", ok, `state=${m.getHeldState()} hangar=${m.isPadVisible()} sky=${m.isSkyPadVisible()}`)
  }
}

@component
export class SH_N_DropIcons extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("n_drop_icons")
    const m = getMain()
    await waitReady(m, c)
    c.check("icons closed at start", "inspection", closed(m))

    // 1. Sky -> Hangar, one at a time: plane, helicopter, satellite.
    for (const id of ["FR935Q", "VLZ05", "SAT48274"]) {
      await skyDrop(c, m, id, true, true)
      await sleep(200)
    }
    // 2. Sky -> Sky icon (send back), each kind.
    for (const id of ["DL31", "JJ8084", "SAT20580"]) await skyDrop(c, m, id, false, true)

    // 3. Hangar -> Sky ("Release"), each kind: plane, helicopter, satellite.
    m.openHangar()
    await sleep(300)
    for (const id of ["VS93", "GUIDO", "SAT25544"]) {
      await hangarDrop(c, m, id, true, true)
      await sleep(200)
    }
    // Hangar -> Hangar icon (back to its slot), plane and satellite.
    for (const id of ["BA169", "EY69W"]) await hangarDrop(c, m, id, false, true)
    m.openSky()
    await sleep(300)

    // 4. Rapid repeated drops: the next pull starts while the last model is still gliding.
    for (const id of ["FR935Q", "VLZ05", "SAT48274", "FR935Q"]) await skyDrop(c, m, id, true, false)
    c.check("rapid Sky -> Hangar x4: both icons closed afterwards", "test hook", await settleClosed(m, 3500), `state=${m.getHeldState()}`)
    for (const id of ["DL31", "JJ8084", "SAT20580", "DL31"]) await skyDrop(c, m, id, false, false)
    c.check("rapid Sky -> Sky icon x4: both icons closed afterwards", "test hook", await settleClosed(m, 3500), `state=${m.getHeldState()}`)
    m.openHangar()
    await sleep(300)
    for (const id of ["BA169", "EY69W", "BA169"]) await hangarDrop(c, m, id, false, false)
    c.check("rapid Hangar -> slot x3: both icons closed afterwards", "test hook", await settleClosed(m, 3500), `state=${m.getHeldState()}`)
    for (const id of ["CX257", "AY96W", "LX29K", "BY8AB"]) await hangarDrop(c, m, id, true, false)
    c.check("rapid Hangar -> Sky x4: both icons closed afterwards", "test hook", await settleClosed(m, 3500), `state=${m.getHeldState()}`)
    m.openSky()
    await sleep(300)

    // 4b. Throwing must never flash the icons: hidden in the same frame as the release, and on every frame after.
    for (const id of ["FR935Q", "SAT48274"]) {
      m.pullSkyObject(id)
      await waitUntil(() => m.getHeldState() === "held", 2500)
      await sleep(400)
      m.releaseHeld(false)
      let seen = closed(m) ? 0 : 1
      for (let i = 0; i < 40; i++) {
        await nextFrame()
        if (!closed(m)) seen++
      }
      c.check(`${id}: icons never visible after a throw release`, "test hook", seen === 0, `${seen} frames visible`)
      await waitUntil(() => m.getHeldState() === "resting", 6000)
      m.sendHeldToSky()
      await settleClosed(m, 3000)
    }

    // 5. Safety timeout: icons forced open with nothing held close by themselves.
    m.debugForceIconsOpen()
    c.check("forced-open icons are visible", "test hook", m.isPadVisible() && m.isSkyPadVisible())
    const t0 = Date.now()
    const ok = await waitUntil(() => closed(m), 2500)
    c.check("stuck icons force-close within ~1.5 s", "test hook", ok && Date.now() - t0 < 2200, `${Date.now() - t0} ms`)

    // 6. Mode change while holding resets everything.
    c.check("pull for mode-change test", "test hook", m.pullSkyObject("SAT48274"))
    await waitUntil(() => m.getHeldState() === "held", 2500)
    c.check("icons open while holding", "test hook", await waitUntil(() => m.isPadVisible() && m.isSkyPadVisible(), 1500))
    m.openRadar()
    c.check("mode change drops the held model", "test hook", m.getHeldState() === "none")
    c.check("mode change closes both icons", "test hook", closed(m))
    m.openSky()
    await sleep(300)
    c.finish()
  }
}
