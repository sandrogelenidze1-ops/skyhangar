// Task M7 step 6: variety. Family counts for the recorded flights, at least 4 airliner families in the sky, and every model
// family (airliners, jets, regional, turboprop, each helicopter and satellite family) present in the Hangar shelf on first open.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {SKY_OBJECTS} from "../../../Scripts/SkyHangarFlightData"
import {familyForInfo} from "../../../Scripts/SkyHangarModelFactory"
import {Checks, getMain, waitReady} from "../SkyHangarTestKit"

const AIRLINERS = ["narrowbody", "widebody", "largeWidebody", "jumbo", "superjumbo", "regional", "turboprop", "bizSmall", "bizLarge"]
const HELIS = ["lightPiston", "lightTurbine", "mediumTwin", "largeTransport", "tandem"]
const SATS = ["cubesat", "comms", "flatpanel", "station"]

@component
export class SH_M7_Variety extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("m7_variety")
    const main = getMain()
    await waitReady(main, c)
    const sky: {[f: string]: number} = {}
    for (const o of SKY_OBJECTS) sky[familyForInfo(o)] = (sky[familyForInfo(o)] ?? 0) + 1
    print("[SH-TEST] sky family counts (recorded flights): " + JSON.stringify(sky))
    const airlinerFamilies = Object.keys(sky).filter((f) => AIRLINERS.indexOf(f) >= 0)
    c.check(`sky has at least 4 airliner families (${airlinerFamilies.length}: ${airlinerFamilies.join(",")})`, "inspection", airlinerFamilies.length >= 4)
    const shelf: {[f: string]: number} = {}
    for (const e of main.shelf.getEntries()) shelf[familyForInfo(e.info)] = (shelf[familyForInfo(e.info)] ?? 0) + 1
    print("[SH-TEST] hangar shelf family counts on first open: " + JSON.stringify(shelf))
    const missing = AIRLINERS.concat(HELIS, SATS).filter((f) => !shelf[f])
    c.check(`hangar shelf has every family (missing: ${missing.join(",") || "none"})`, "inspection", missing.length === 0)
    const ex = main.shelf.getEntries().filter((e) => e.info.id.indexOf("EX_") === 0)
    const fictional = ["Meridian Air", "Solace Airways", "Kestrel Air", "Arcadia Airlines", "Halcyon Air", "Vireo Airways", "Cobalt Air", "Lumen Airways", "Ridgeway Air Rescue", "Coastline Helicopters", "Northwind Aviation", "Tern Air Services", "Orbis Labs", "Nimbus Orbital", "Aster Space", "Polaris Orbital"]
    c.check("example models use fictional operators and no 'Example model' text", "inspection", ex.length > 0 && ex.every((e) => fictional.indexOf(e.info.airline) >= 0 && e.info.flight.toLowerCase().indexOf("example") < 0 && e.where.toLowerCase().indexOf("example") < 0))
    c.check("example planes have a real IATA route and every example has a 'DD Mon HH:MM' date", "inspection", ex.every((e) => /^\d{1,2} [A-Z][a-z]{2} \d\d:\d\d$/.test(e.when) && (e.info.kind !== "plane" || (/^[A-Z]{3}$/.test(e.info.origin) && /^[A-Z]{3}$/.test(e.info.destination) && e.info.origin !== e.info.destination))))
    c.finish()
  }
}
