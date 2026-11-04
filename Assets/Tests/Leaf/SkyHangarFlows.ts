// SkyHangarFlows.ts
// Reusable assertion flows shared by several SkyHangar LEAF scenarios (card content, collect
// result, throw-and-return). Test-only.

import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {SKY_OBJECTS} from "../../Scripts/SkyHangarFlightData"
import {SkyHangarMain} from "../../Scripts/SkyHangarMain"
import {Checks, InputKind, FLIGHTS, waitUntil, recordStates, findChild, fmtVec, quatAngleDeg} from "./SkyHangarTestKit"

export interface TrailSeg { pos: vec3; len: number; width: number; alpha: number }

/** Enabled trail segments in drawing order (TrailSolid_i = behind, TrailDot_i = ahead). */
export function trailSegments(): {solid: TrailSeg[]; dots: TrailSeg[]} {
  const read = (prefix: string): TrailSeg[] => {
    const out: TrailSeg[] = []
    for (let i = 0; i < 80; i++) {
      const o = findSceneObjectByName(prefix + i)
      if (!o) break
      if (!o.isEnabledInHierarchy) continue
      const t = o.getTransform()
      const mesh = o.getChildrenCount() > 0 ? (o.getChild(0).getComponent("Component.RenderMeshVisual") as RenderMeshVisual) : null
      out.push({pos: t.getWorldPosition(), len: t.getLocalScale().z, width: t.getLocalScale().x, alpha: mesh ? mesh.mainMaterial.mainPass.baseColor.w : -1})
    }
    return out
  }
  return {solid: read("TrailSolid_"), dots: read("TrailDot_")}
}

export function infoOf(id: string) {
  return SKY_OBJECTS.find((o) => o.id === id)
}

/** Card rows for a plane must match flights.json. */
export function checkPlaneCard(c: Checks, main: SkyHangarMain, id: "VS93" | "DL31", input: InputKind, tag: string): void {
  const f = FLIGHTS[id]
  c.check(`${tag}: card visible`, input, main.isCardVisible())
  c.check(`${tag}: card shows flight id ${id}`, input, main.getCardFlightId() === id, `got "${main.getCardFlightId()}"`)
  const airline = main.getCardText("airline")
  c.check(`${tag}: airline row = ${f.airline}`, input, airline === f.airline, `got "${airline}"`)
  const flight = main.getCardText("flight")
  c.includes(`${tag}: flight row has flight number`, input, flight, f.flight)
  const route = main.getCardText("route")
  c.check(`${tag}: route row "X → Y"`, input,
    route.indexOf(f.origin) >= 0 && route.indexOf("→") > route.indexOf(f.origin) && route.indexOf(f.destination) > route.indexOf("→"),
    `expected ${f.origin} → ${f.destination}, got "${route}"`)
  const times = main.getCardText("times")
  c.check(`${tag}: times row has takeoff ${f.departUtc} and landing ${f.arriveUtc}`, input,
    times.indexOf(f.departUtc) >= 0 && times.indexOf(f.arriveUtc) >= 0, `got "${times}"`)
  const aircraft = main.getCardText("aircraft")
  c.check(`${tag}: aircraft row has type ${f.aircraftTypeName} (${f.aircraftType})`, input,
    aircraft.indexOf(f.aircraftType) >= 0 && aircraft.indexOf(f.aircraftTypeName) >= 0, `got "${aircraft}"`)
  const alt = main.getCardText("altSpeed")
  c.check(`${tag}: altitude ${f.altitude} and speed ${f.speed}`, input,
    alt.indexOf(f.altitude) >= 0 && alt.indexOf(f.speed) >= 0, `got "${alt}"`)
}

export function cardRows(main: SkyHangarMain): string {
  return ["airline", "flight", "route", "times", "cities", "aircraft", "altSpeed"].map((r) => main.getCardText(r)).join(" | ")
}

/** Model under HeldModel exists, is enabled and uses the shared palette material. */
export function checkHeldModel(c: Checks, main: SkyHangarMain, id: string, input: InputKind): void {
  const holder = main.held.getModelObject()
  c.check("held model object exists and is enabled", input, !!holder && holder.isEnabledInHierarchy)
  if (!holder) return
  const model = findChild(holder, "Model_" + id)
  c.check(`3D model "Model_${id}" built under HeldModel`, input, !!model)
  if (model) {
    // Models are built by SkyHangarModelFactory: one merged body mesh + spinners, one shared palette-textured material.
    const mats: Material[] = []
    const walk = (o: SceneObject) => {
      const r = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      if (r && r.mainMaterial) mats.push(r.mainMaterial)
      for (let i = 0; i < o.getChildrenCount(); i++) walk(o.getChild(i))
    }
    walk(model)
    c.check("model is a few merged meshes sharing one palette material", input,
      mats.length >= 1 && mats.length <= 4 && mats.every((m) => m === mats[0]) && !!mats[0].mainPass.baseTex, `${mats.length} meshes`)
  }
}

/**
 * After the model is "held": pad visible, glow over pad, release over pad -> Collected, +1 counts,
 * new plaque text. moveOver/release are passed in so hooks and real input share the assertions.
 */
export async function collectFlow(
  c: Checks, main: SkyHangarMain, id: string, input: InputKind,
  moveOver: () => Promise<void>, release: () => Promise<void>, expectStartShelf12: boolean
): Promise<void> {
  const info = infoOf(id)
  const collected0 = main.getCollectedCount()
  const shelf0 = main.getShelfCount()
  if (expectStartShelf12) c.check("shelf starts with 12 pre-filled models (round 1)", "inspection", shelf0 === 12, `shelf=${shelf0}`)
  c.check("held state is 'held'", input, main.getHeldState() === "held", `state=${main.getHeldState()}`)
  c.check(`held object id = ${id}`, input, main.getHeldObjectId() === id, `got "${main.getHeldObjectId()}"`)
  checkHeldModel(c, main, id, input)
  await waitUntil(() => main.isPadVisible(), 1500)
  c.check("hangar pad faded in while holding", input, main.isPadVisible())
  c.check("pad not glowing before model is over it", input, !main.isPadGlowing())
  c.check("Sky return pad also shown while holding (round 1)", input, main.isSkyPadVisible())

  await moveOver()
  const glow = await waitUntil(() => main.isPadGlowing(), 1500)
  c.check("pad glows with the model over it", input, glow, `state=${main.getHeldState()}`)
  c.check("Sky pad not glowing while over the hangar pad (nearer pad wins)", input, !main.isSkyPadGlowing())

  await release()
  const stamp = await waitUntil(() => main.isStampVisible(), 2500)
  c.check("Collected stamp visible after release over pad", input, stamp)
  const stampText = String((main.labels as any).stamp?.big?.text ?? "")
  c.check('stamp text reads "Collected"', input, stampText.toLowerCase().indexOf("collected") >= 0, `got "${stampText}"`)
  c.check("collected count +1", input, main.getCollectedCount() === collected0 + 1, `${collected0} -> ${main.getCollectedCount()}`)
  c.check("shelf count +1", input, main.getShelfCount() === shelf0 + 1, `${shelf0} -> ${main.getShelfCount()}`)
  c.check("held state back to 'none' after collect", input, main.getHeldState() === "none", `state=${main.getHeldState()}`)
  const vis = main.getHangarVisibleIds()
  c.check("hangar jumps to the page showing the newest model", input, vis.indexOf(id) >= 0, `page ${main.getHangarPage()} shows [${vis.join(",")}]`)
  const plaque = main.getShelfPlaqueText(shelf0)
  print(`[SH-TEST] plaque[${shelf0}] = "${plaque}"`)
  c.check("new plaque exists in the new shelf slot", input, plaque.length > 0, `slot ${shelf0}`)
  if (info) {
    c.includes("plaque has airline/operator", input, plaque, info.airline)
    c.includes("plaque has flight number", input, plaque, info.flight)
    if (info.kind === "plane") c.includes("plaque has route", input, plaque, info.origin + " → " + info.destination)
    else c.check("plaque has a route/orbit line", input, plaque.split(" | ").length >= 3, `"${plaque}"`)
  }
  c.includes("plaque has where collected", input, plaque, main.collectedPlace)
  c.check("plaque has when collected (d Mon hh:mm)", input, /\d{1,2} [A-Z][a-z]{2} \d\d:\d\d/.test(plaque), `"${plaque}"`)
}

/** After the model is held: release away from the pad and verify the throw-and-return loop. */
export async function throwFlow(c: Checks, main: SkyHangarMain, id: string, input: InputKind, release: () => Promise<void>, checkRotor: boolean): Promise<void> {
  c.check("held state is 'held' before release", input, main.getHeldState() === "held", `state=${main.getHeldState()}`)
  c.check(`held object id = ${id}`, input, main.getHeldObjectId() === id, `got "${main.getHeldObjectId()}"`)
  c.check("pad not glowing (model away from pad)", input, !main.isPadGlowing())
  const collected0 = main.getCollectedCount()
  const shelf0 = main.getShelfCount()
  const holder = main.held.getModelObject()
  const rotor = holder ? findChild(holder, "MainRotor") : null
  if (checkRotor) c.check("helicopter model has a MainRotor", "inspection", !!rotor)

  await release()
  let maxDist = 0
  let rotorSpinDeg = 0
  let spinFlagDuringThrow = false
  let prevRot: quat | null = null
  let thrownFrames = 0
  const states = await recordStates(() => main.getHeldState(), 3200, () => {
    const st = main.getHeldState()
    const h = main.held.getHandWorldPos()
    const p = main.held.getModelWorldPos()
    maxDist = Math.max(maxDist, p.distance(h))
    if ((st === "thrown" || st === "returning") && rotor) {
      thrownFrames++
      if (main.isRotorSpinning()) spinFlagDuringThrow = true
      const r = rotor.getTransform().getLocalRotation()
      if (prevRot) rotorSpinDeg += quatAngleDeg(prevRot, r)
      prevRot = r
    }
  })
  print(`[SH-TEST] ${id} throw states: ${states.join(" -> ")}; maxDist=${maxDist.toFixed(1)}cm`)
  const iT = states.indexOf("thrown")
  const iR = states.indexOf("returning")
  const iS = states.lastIndexOf("resting")
  c.check("state goes thrown -> returning -> resting", input, iT >= 0 && iR > iT && iS > iR, states.join(" -> "))
  c.check("model actually flew away (> 100 cm from hand)", input, maxDist > 100, `max ${maxDist.toFixed(1)} cm`)
  await sleep(500)
  const d = main.held.getModelWorldPos().distance(main.held.getHandWorldPos())
  c.check("model back at the hand (< 8 cm)", input, d < 8, `${d.toFixed(1)} cm; model ${fmtVec(main.held.getModelWorldPos())} hand ${fmtVec(main.held.getHandWorldPos())}`)
  c.check("final state resting (or held)", input, main.getHeldState() === "resting" || main.getHeldState() === "held", `state=${main.getHeldState()}`)
  c.check("throw did not collect", input, main.getCollectedCount() === collected0 && main.getShelfCount() === shelf0)
  if (checkRotor) {
    c.check("isRotorSpinning() true during throw", input, spinFlagDuringThrow)
    c.check("rotor rotation actually changes during throw", input, rotorSpinDeg > 90, `${rotorSpinDeg.toFixed(0)} deg over ${thrownFrames} frames`)
  }
  await nextFrame()
}
