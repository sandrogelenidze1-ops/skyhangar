// Criterion 1a (+ round 1 item 7): marker counts per kind; each kind is a distinct flat glyph
// (plane silhouette / helicopter with rotor cross / satellite dot with ring), no 3D models in the sky;
// satellites cyan, helicopters amber, planes white.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {findSceneObjectByName} from "Leaf.lspkg/Utils/common/Utils"
import {SKY_OBJECTS} from "../../../Scripts/SkyHangarFlightData"
import {Checks, getMain, waitReady, findChild, countChildrenWithPrefix, collectBaseColors, colorClose, fmtColor} from "../SkyHangarTestKit"

@component
export class SH_C1_Markers extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("c1_markers")
    const main = getMain()
    await waitReady(main, c)
    const np = main.getSkyMarkerCount("plane")
    const nh = main.getSkyMarkerCount("helicopter")
    const ns = main.getSkyMarkerCount("satellite")
    c.check("12 plane markers", "inspection", np === 12, `got ${np}`)
    c.check("2 helicopter markers", "inspection", nh === 2, `got ${nh}`)
    c.check("4 satellite markers", "inspection", ns === 4, `got ${ns}`)
    const missing = SKY_OBJECTS.filter((o) => !findSceneObjectByName("SkyMarker_" + o.id)).map((o) => o.id)
    c.check("a SkyMarker_<id> SceneObject exists for all 18 ids", "inspection", missing.length === 0, missing.length ? "missing " + missing.join(",") : "18/18")

    // Distinct glyph shapes for every marker of each kind.
    const bad: string[] = []
    for (const o of SKY_OBJECTS) {
      const m = findSceneObjectByName("SkyMarker_" + o.id)
      if (!m) continue
      const plane = !!findChild(m, "Fuselage") && !!findChild(m, "WingL")
      const heli = !!findChild(m, "RotorCross")
      const sat = !!findChild(m, "Dot") && countChildrenWithPrefix(m, "Ring_") > 0
      const ok = o.kind === "plane" ? plane && !heli && !sat : o.kind === "helicopter" ? heli && !plane && !sat : sat && !plane && !heli
      if (!ok) bad.push(o.id)
    }
    c.check("every marker uses its kind's glyph (plane silhouette / rotor cross / dot + ring)", "inspection", bad.length === 0, bad.length ? "wrong: " + bad.join(",") : "18/18")
    const skyObjects = findSceneObjectByName("SkyObjects")
    const models3d = skyObjects ? countChildrenWithPrefix(skyObjects, "Model_") : -1
    c.check("no 3D models in the sky (no Model_* under SkyObjects)", "inspection", models3d === 0, `${models3d} found`)

    // Colours: configured and actually rendered.
    const pc = main.getSkyMarkerColor("plane")
    const sc = main.getSkyMarkerColor("satellite")
    const hc = main.getSkyMarkerColor("helicopter")
    c.check("satellite colour is cyan (0.35, 0.9, 1.0)", "inspection", colorClose(sc, new vec4(0.35, 0.9, 1.0, 1)), fmtColor(sc))
    c.check("satellite colour differs from plane colour", "inspection", !colorClose(pc, sc, 0.1), `plane ${fmtColor(pc)} sat ${fmtColor(sc)}`)
    c.check("helicopter colour (amber) differs from plane colour", "inspection", !colorClose(pc, hc, 0.1) && hc.x > hc.z, `plane ${fmtColor(pc)} heli ${fmtColor(hc)}`)
    const rendered = (id: string, col: vec4) => {
      const m = findSceneObjectByName("SkyMarker_" + id)
      const cols = m ? collectBaseColors(m) : []
      return {ok: cols.length > 0 && cols.every((x) => colorClose(x, col)), n: cols.length, sample: cols.slice(0, 2).map(fmtColor).join(" ")}
    }
    for (const [id, col, kind] of [["SAT25544", sc, "satellite"], ["VS93", pc, "plane"], ["VLZ05", hc, "helicopter"]] as [string, vec4, string][]) {
      const r = rendered(id, col)
      c.check(`rendered ${kind} glyph (${id}) is entirely its kind colour`, "inspection", r.ok, `${r.n} meshes, e.g. ${r.sample}`)
    }
    c.finish()
  }
}
