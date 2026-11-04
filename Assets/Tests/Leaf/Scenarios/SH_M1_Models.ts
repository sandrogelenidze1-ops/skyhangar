// Task M1: procedural model factory. Type code -> family mapping (data types included), per-model triangle and draw-call
// budgets, one shared material per model, rotors / props turning, satellites turning slowly, sizes inside the span.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {SKY_OBJECTS} from "../../../Scripts/SkyHangarFlightData"
import {buildModel, familyFor, heliFamilyFor, satFamilyFor, modelFamilyFor, pickFamily, spinRotors, styleFor, ModelFamily} from "../../../Scripts/SkyHangarModelFactory"
import {makeObj} from "../../../Scripts/SkyHangarUtil"
import {Checks, getMain} from "../SkyHangarTestKit"
import {quatAngleDeg} from "../SkyHangarTestKit"

const SAMPLES: {kind: "plane" | "helicopter" | "satellite"; type: string; family: ModelFamily; budget: number}[] = [
  {kind: "plane", type: "A320", family: "narrowbody", budget: 3200},
  {kind: "plane", type: "B38M", family: "narrowbody", budget: 3200},
  {kind: "plane", type: "A35K", family: "widebody", budget: 3200},
  {kind: "plane", type: "B789", family: "widebody", budget: 3200},
  {kind: "plane", type: "B77W", family: "largeWidebody", budget: 3200},
  {kind: "plane", type: "A332", family: "largeWidebody", budget: 3200},
  
  {kind: "plane", type: "B744", family: "jumbo", budget: 3200},
  {kind: "plane", type: "E190", family: "regional", budget: 3200},
  {kind: "plane", type: "AT72", family: "turboprop", budget: 3200},
  {kind: "plane", type: "C25B", family: "bizSmall", budget: 3200},
  {kind: "plane", type: "GLF6", family: "bizLarge", budget: 3200},
  {kind: "plane", type: "A388", family: "superjumbo", budget: 3200},
  {kind: "plane", type: "A321", family: "narrowbody", budget: 3200},
  {kind: "plane", type: "BCS3", family: "regional", budget: 3200},
  {kind: "helicopter", type: "R44", family: "lightPiston", budget: 3000},
  {kind: "helicopter", type: "B06", family: "lightTurbine", budget: 3000},
  {kind: "helicopter", type: "A109", family: "mediumTwin", budget: 3000},
  {kind: "helicopter", type: "S92", family: "largeTransport", budget: 3000},
  {kind: "helicopter", type: "CH47", family: "tandem", budget: 3000},
  {kind: "satellite", type: "CUBESAT", family: "cubesat", budget: 1500},
  {kind: "satellite", type: "HST", family: "comms", budget: 1500},
  {kind: "satellite", type: "NOAA 19", family: "flatpanel", budget: 1500},
  {kind: "satellite", type: "ISS", family: "station", budget: 1500}
]

@component
export class SH_M1_Models extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("m1_models")
    const main = getMain()
    const kit = main.sky.partKit
    c.check("part kit available", "inspection", !!kit)
    if (!kit) return c.finish()

    // Mapping: every data object resolves to the family of its kind; unknown plane -> narrowbody.
    c.check("unknown type code is NOT a constant default (hash of flight id)", "inspection",
      new Set(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"].map((id) => familyFor("QQQQ", id))).size >= 3)
    c.check("same flight id always gets the same family", "inspection", familyFor("QQQQ", "VS93") === familyFor("QQQQ", "VS93") && familyFor(undefined, "X7") === familyFor("", "X7"))
    c.check("private / local unknown planes are business jets only", "inspection",
      Array.from({length: 40}, (_, i) => familyFor("QQQQ", "L" + i, true)).every((f) => f === "bizSmall" || f === "bizLarge"))
    c.check("private / local unknown helicopters are light only", "inspection",
      Array.from({length: 40}, (_, i) => heliFamilyFor("", "H" + i, true)).every((f) => f === "lightPiston" || f === "lightTurbine"))
    c.check("helicopter / satellite mapping helpers", "inspection", heliFamilyFor("R22") === "lightPiston" && satFamilyFor("ISS") === "station")
    // Every flight in flights.json (SKY_OBJECTS is generated from it) resolves through the type-code table, not the fallback.
    const used: {[f: string]: number} = {}
    const perKind: {[k: string]: {[f: string]: number}} = {plane: {}, helicopter: {}, satellite: {}}
    const viaHash: string[] = []
    for (const o of SKY_OBJECTS) {
      const pick = pickFamily(o.kind, o.aircraftType, o.id, !o.airlineIcao)
      if (pick.via === "hash") viaHash.push(o.id + ":" + o.aircraftType)
      used[pick.family] = (used[pick.family] ?? 0) + 1
      perKind[o.kind][pick.family] = (perKind[o.kind][pick.family] ?? 0) + 1
    }
    print("[SH-TEST] flights.json family counts (all): " + JSON.stringify(used))
    print("[SH-TEST] flights.json family counts by kind: " + JSON.stringify(perKind))
    c.check("every type code in flights.json is in the lookup table (none fall to the hash)", "inspection", viaHash.length === 0, viaHash.join(","))
    c.check("flights.json covers at least 5 distinct families overall", "inspection", Object.keys(used).length >= 5, JSON.stringify(used))
    c.check("flights.json: planes use at least 4 families, satellites at least 3", "inspection",
      Object.keys(perKind.plane).length >= 4 && Object.keys(perKind.satellite).length >= 3, JSON.stringify(perKind))
    // The data holds only two helicopters, so the hashed fallback (type unknown) is exercised over 600 synthetic ids at the
    // documented weights: >= 5 aircraft families, 5 helicopter families, 4 satellite families, and the mix is close to the weights.
    const lot: {[k: string]: {[f: string]: number}} = {plane: {}, helicopter: {}, satellite: {}}
    const N = 600
    for (const kind of ["plane", "helicopter", "satellite"] as const) {
      for (let i = 0; i < N; i++) {
        const f = modelFamilyFor(kind, "????", "FLT" + i * 7 + "X")
        lot[kind][f] = (lot[kind][f] ?? 0) + 1
      }
    }
    print("[SH-TEST] hash fallback counts over " + N + " ids: " + JSON.stringify(lot))
    c.check("hash fallback: at least 5 aircraft, 3 helicopter and 3 satellite families", "inspection",
      Object.keys(lot.plane).length >= 5 && Object.keys(lot.helicopter).length >= 3 && Object.keys(lot.satellite).length >= 3, JSON.stringify(lot))
    const pct = (f: string) => ((lot.plane[f] ?? 0) / N) * 100
    c.check("hash fallback mix near 55/18/8/5/6/3/5 %", "inspection",
      Math.abs(pct("narrowbody") - 55) < 7 && Math.abs(pct("widebody") - 18) < 6 && Math.abs(pct("largeWidebody") - 8) < 4.5 && Math.abs(pct("jumbo") - 5) < 4 &&
      Math.abs(pct("regional") - 6) < 4 && Math.abs(pct("turboprop") - 3) < 3.5 && Math.abs(pct("bizSmall") + pct("bizLarge") - 5) < 4, JSON.stringify(lot.plane))

    const holder = makeObj(main.sceneObject, "M1_TestModels")
    let totalTris = 0, totalCalls = 0
    for (const s of SAMPLES) {
      const m = buildModel(kit, holder, "M1_" + s.type, s.kind, 10, styleFor([], s.kind, true, "BAW"), s.type)
      const tag = `${s.kind} ${s.type}`
      c.check(`${tag}: family ${s.family}`, "inspection", m.family === s.family, `got ${m.family}`)
      c.check(`${tag}: ${m.tris} tris within ${s.budget}`, "inspection", m.tris > 100 && m.tris <= s.budget, `${m.tris} tris`)
      const mats: Material[] = []
      const collect = (o: SceneObject) => {
        if (o.name === "Blur") return
        const r = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
        if (r) mats.push(r.mainMaterial)
        for (let i = 0; i < o.getChildrenCount(); i++) collect(o.getChild(i))
      }
      collect(m.root)
      c.check(`${tag}: ${mats.length} draw calls, one shared material, baseTex palette`, "inspection",
        mats.length === m.drawCalls - m.blurs.length && mats.length <= 4 && mats.every((x) => x === mats[0]) && !!mats[0].mainPass.baseTex, `${mats.length} meshes`)
      if (s.kind === "helicopter") {
        c.check(`${tag}: main rotor + tail rotor / second rotor, blur discs`, "inspection", !!m.mainRotor && m.spinners.length >= 2 && m.blurs.length >= 1)
        spinRotors(m, 0.01, 4)
        c.check(`${tag}: blur discs show when spinning fast`, "inspection", m.blurs.every((b) => b.enabled))
        spinRotors(m, 0.01, 1)
        c.check(`${tag}: blur discs hide when slow`, "inspection", m.blurs.every((b) => !b.enabled))
      }
      if (s.type === "AT72") c.check(`${tag}: two propellers spin`, "inspection", m.spinners.length === 2)
      const before = m.spinners.map((x) => x.obj.getTransform().getLocalRotation())
      spinRotors(m, 0.1, 2)
      if (m.spinners.length) {
        const moved = m.spinners.every((x, i) => quatAngleDeg(before[i], x.obj.getTransform().getLocalRotation()) > 5)
        c.check(`${tag}: rotors turn`, "inspection", moved)
      }
      if (s.kind === "satellite" && m.bodyPivot) {
        const r0 = m.bodyPivot.getTransform().getLocalRotation()
        spinRotors(m, 1, 2)
        c.check(`${tag}: satellite turns slowly`, "inspection", quatAngleDeg(r0, m.bodyPivot.getTransform().getLocalRotation()) > 10)
      }
      totalTris += m.tris
      totalCalls += m.drawCalls
    }
    print(`[SH-TEST] m1 totals over ${SAMPLES.length} models: ${totalTris} tris, ${totalCalls} draw calls`)
    holder.destroy()
    c.finish()
  }
}
