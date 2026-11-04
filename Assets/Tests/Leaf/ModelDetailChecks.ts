// Pure model-detail checks (no Lens globals) so the same assertions run in the LEAF scenario SH_M3_ModelDetail and in plain Node.
import {buildGeo, SLOT, PALETTE_SLOTS, CELL_PX} from "../../Scripts/SkyHangarModelGeo"
import type {ModelGeo, ModelFamily} from "../../Scripts/SkyHangarModelGeo"

export interface Check {
  check(name: string, input: "inspection", pass: boolean, detail?: string): boolean
}

const AIRLINERS: ModelFamily[] = ["narrowbody", "widebody", "largeWidebody", "jumbo", "superjumbo", "regional", "turboprop", "bizSmall", "bizLarge"]
const HELIS: ModelFamily[] = ["lightPiston", "lightTurbine", "mediumTwin", "largeTransport", "tandem"]
const SATS: ModelFamily[] = ["cubesat", "comms", "flatpanel", "station"]

const slotU = (slot: number) => (slot * CELL_PX + CELL_PX / 2) / (PALETTE_SLOTS * CELL_PX)

/** Vertices of a slot: [x, y, z, nx, ny, nz]. */
function vertsOfSlot(geo: ModelGeo, slot: number): number[][] {
  const out: number[][] = []
  const g = geo.body
  const u = slotU(slot)
  for (let i = 0; i < g.verts; i++) {
    if (Math.abs(g.uv[i * 2] - u) < 1e-6) out.push([g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2], g.nrm[i * 3], g.nrm[i * 3 + 1], g.nrm[i * 3 + 2]])
  }
  return out
}

function slotsUsed(geo: ModelGeo, filter: (nx: number, ny: number, nz: number) => boolean): number {
  const seen = new Set<number>()
  const g = geo.body
  for (let i = 0; i < g.verts; i++) {
    if (!filter(g.nrm[i * 3], g.nrm[i * 3 + 1], g.nrm[i * 3 + 2])) continue
    seen.add(Math.round(g.uv[i * 2] * PALETTE_SLOTS * CELL_PX / CELL_PX - 0.5))
  }
  return seen.size
}

export function runModelDetailChecks(c: Check, print: (s: string) => void): void {

    for (const fam of AIRLINERS) {
      const geo = buildGeo(fam)
      const w = (geo.windows ?? []).filter((x) => x.row === "main")
      const fus = geo.fus!
      const right = w.filter((x) => x.side === 0), left = w.filter((x) => x.side === 1)
      const main = right.filter((x) => x.u >= 0.14 && x.u <= 0.8)
      c.check(`${fam}: windows on both sides (${right.length} + ${left.length})`, "inspection", right.length >= 5 && right.length === left.length, `${right.length}/${left.length}`)
      if (fam !== "bizSmall" && fam !== "bizLarge") {
        const us = right.map((x) => x.u).sort((a, b) => a - b)
        const pitch = us.filter((u, i) => i > 0 && us[i] - us[i - 1] < 0.12 * fus.D / fus.L).map((u, i) => u - us[us.indexOf(u) - 1])
        const medPitch = pitch.sort((a, b) => a - b)[Math.floor(pitch.length / 2)] * fus.L / fus.D
        c.check(`${fam}: window pitch ~0.11 D (got ${medPitch.toFixed(3)} D)`, "inspection", Math.abs(medPitch - 0.11) < 0.005)
        c.check(`${fam}: windows from 0.14 L to 0.80 L (got ${us[0].toFixed(3)}..${us[us.length - 1].toFixed(3)})`, "inspection", us[0] >= 0.1399 && us[us.length - 1] <= 0.8001 && us[0] < 0.16 && us[us.length - 1] > 0.77)
      }
      // height: mid-cabin windows sit ~25 deg above the horizontal midline of the fuselage (fuselage centre y = 0 there)
      const mid = main.filter((x) => x.u > 0.3 && x.u < 0.6)
      const angs = mid.map((x) => (Math.atan2(x.c[1], Math.abs(x.c[0])) * 180) / Math.PI)
      const minA = Math.min(...angs), maxA = Math.max(...angs)
      c.check(`${fam}: window row ${minA.toFixed(1)}..${maxA.toFixed(1)} deg above midline (want ~25, not on top)`, "inspection", minA > 21 && maxA < 29)
      // windscreen: dark glass flush with the hull, flanking the nose from t = 0.45 to 0.35 D behind the nose start, 0.175 R .. 0.425 R above the axis
      const ws = geo.windscreen ?? []
      const g = geo.body
      const R = fus.D / 2
      let yMin = 1e9, yMax = -1e9, zMin = 1e9, zMax = -1e9, inward = 0, tris = 0
      for (const p of ws) for (let t = p.tri0; t < p.tri1; t++) {
        const k = [g.idx[t * 3], g.idx[t * 3 + 1], g.idx[t * 3 + 2]]
        const q = k.map((i) => [g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]])
        for (const v of q) { yMin = Math.min(yMin, v[1]); yMax = Math.max(yMax, v[1]); zMin = Math.min(zMin, v[2]); zMax = Math.max(zMax, v[2]) }
        const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], e2 = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]]
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
        if (n[0] * (q[0][0] + q[1][0] + q[2][0]) + n[1] * (q[0][1] + q[1][1] + q[2][1]) < 0) inward++
        tris++
      }
      const topR = yMax / R, botR = yMin / R, ctrR = (yMin + yMax) / 2 / R
      const noseLen = (fam === "turboprop" ? 0.9 : fam === "regional" || fam === "bizSmall" || fam === "bizLarge" ? 1.5 : 1.4) * fus.D
      const zStartD = (zMin - fus.zNose) / fus.D, zEndD = (zMax - fus.zNose) / fus.D
      print(`[SH-TEST] ${fam} windscreen: top ${topR.toFixed(3)} R, bottom ${botR.toFixed(3)} R, centre ${ctrR.toFixed(3)} R, from ${zStartD.toFixed(2)} D to ${zEndD.toFixed(2)} D behind the tip (nose ${(noseLen / fus.D).toFixed(1)} D)`)
      c.check(`${fam}: windscreen glass present (${ws.length} panes, ${tris} tris), faces outward (${inward} inward)`, "inspection", ws.length >= 1 && tris > 0 && inward === 0)
      c.check(`${fam}: windscreen top ${topR.toFixed(3)} R <= 0.65 R and centre ${ctrR.toFixed(2)} R ~ 0.30 R`, "inspection", topR <= 0.65 && Math.abs(ctrR - 0.3) < 0.03)
      c.check(`${fam}: windscreen starts at t=0.45 and ends 0.35 D behind the nose start`, "inspection", Math.abs(zStartD - noseLen / fus.D * 0.55) < 0.03 && Math.abs(zEndD - (noseLen / fus.D + 0.35)) < 0.03)
    }

    for (const fam of ["bizSmall", "bizLarge"] as ModelFamily[]) {
      const geo = buildGeo(fam)
      const w = geo.windows ?? []
      c.check(`${fam}: oval cabin windows both sides (${w.length})`, "inspection", w.length >= 8 && w.filter((x) => x.side === 0).length === w.filter((x) => x.side === 1).length)
    }

    for (const fam of HELIS) {
      const geo = buildGeo(fam)
      const gl = geo.glazing ?? []
      const kinds = gl.map((x) => `${x.kind}:${x.panels}p gap ${x.minGap.toFixed(4)}..${x.maxGap.toFixed(4)}`).join(" | ")
      print(`[SH-TEST] ${fam} glazing: ${kinds}`)
      const wind = gl.find((x) => x.kind === "wind"), side = gl.find((x) => x.kind === "side")
      c.check(`${fam}: one smooth canopy bubble (${wind ? wind.panels : 0} panel) and no chin / dome glass`, "inspection", !!wind && wind.panels === 1 && !gl.some((x) => x.kind === "dome" || x.kind === "chin"))
      c.check(`${fam}: canopy glass flush with the skin (gap ${wind ? wind.minGap.toFixed(4) + ".." + wind.maxGap.toFixed(4) : "-"} in 0.0001..0.0026)`, "inspection", !!wind && wind.minGap > 0.0001 && wind.maxGap < 0.0026)
      c.check(`${fam}: one side window strip per side, flush (${side ? side.panels : 0} panels)`, "inspection", !!side && side.panels === 2 && side.minGap > 0.0001 && side.maxGap < 0.0026)
      c.check(`${fam}: glass vertex normals point outward from the hull (${(wind?.inward ?? 0) + (side?.inward ?? 0)} inward)`, "inspection", !!wind && !!side && wind.inward === 0 && side.inward === 0)
      c.check(`${fam}: no clear-glass slot, no glass on the back or top of the tail boom`, "inspection", vertsOfSlot(geo, SLOT.CLEAR).length === 0)
      // every glass triangle faces outward from the hull (normal . vector from the body axis > 0); glass only in the cabin (front 55 % of the body), never on the roof
      const g = geo.body
      let inward = 0, tris = 0, aft = 0, zMin = 1e9, zMax = -1e9
      for (let i = 0; i < g.verts; i++) { zMin = Math.min(zMin, g.pos[i * 3 + 2]); zMax = Math.max(zMax, g.pos[i * 3 + 2]) }
      const gu = slotU(SLOT.GLASS)
      const refY = 0, refZ = zMin + 0.2 * (zMax - zMin)
      for (let t = 0; t < g.tris; t++) {
        const k = [g.idx[t * 3], g.idx[t * 3 + 1], g.idx[t * 3 + 2]]
        if (Math.abs(g.uv[k[0] * 2] - gu) > 1e-6) continue
        const p = k.map((q) => [g.pos[q * 3], g.pos[q * 3 + 1], g.pos[q * 3 + 2]])
        const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]]
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
        const cx = (p[0][0] + p[1][0] + p[2][0]) / 3, cy = (p[0][1] + p[1][1] + p[2][1]) / 3, cz = (p[0][2] + p[1][2] + p[2][2]) / 3
        tris++
        if (n[0] * cx + n[1] * (cy - refY) + n[2] * (cz - refZ) < 0) inward++ // outward = away from a point on the cabin axis
        if ((cz - zMin) / (zMax - zMin) > 0.55) aft++
      }
      c.check(`${fam}: glass face normals point outward (${inward} of ${tris} inward)`, "inspection", tris > 0 && inward === 0)
      c.check(`${fam}: no glass on the tail boom (${aft} aft tris)`, "inspection", aft === 0)
    }

    // airliner nose: surface of revolution on the centreline; radius ratio follows the spec table, small rounded cap at the tip
    for (const fam of AIRLINERS) {
      const geo = buildGeo(fam), fus = geo.fus!, g = geo.body
      const slim = fam === "regional" || fam === "bizSmall" || fam === "bizLarge"
      const Ln = (slim ? 1.5 : fam === "turboprop" ? 0.9 : 1.4) * fus.D
      const R = fus.D / 2
      // widest |x| and mean y of the vertices at a station (distance d behind the tip)
      const ring = (t: number) => {
        const zz = fus.zNose + Ln * (1 - t)
        let w = 0, y = 0, n = 0
        for (let i = 0; i < g.verts; i++) {
          if (Math.abs(g.pos[i * 3 + 2] - zz) > 1e-6) continue
          w = Math.max(w, Math.abs(g.pos[i * 3])); y += g.pos[i * 3 + 1]; n++
        }
        return {r: w / R, cy: n ? y / n : 0, n}
      }
      const r9 = ring(0.9), r5 = ring(0.5), tip = ring(1)
      let tipYmin = 1e9, tipYmax = -1e9
      for (let i = 0; i < g.verts; i++) if (g.pos[i * 3 + 2] - fus.zNose < 1e-6) { tipYmin = Math.min(tipYmin, g.pos[i * 3 + 1]); tipYmax = Math.max(tipYmax, g.pos[i * 3 + 1]) }
      const tipOff = (tipYmin + tipYmax) / 2 / fus.D
      print(`[SH-TEST] ${fam} nose: Ln ${(Ln / fus.D).toFixed(1)} D, tip offset ${tipOff.toFixed(4)} D, r/R at t=0.5 ${r5.r.toFixed(3)}, at t=0.9 ${r9.r.toFixed(3)}, tip ring ${tip.r.toFixed(3)} R`)
      c.check(`${fam}: nose tip offset ${tipOff.toFixed(4)} D within 0.03 D of the centreline`, "inspection", Math.abs(tipOff) <= 0.03)
      c.check(`${fam}: radius ratio at t=0.9 is ${r9.r.toFixed(3)} (want 0.19)`, "inspection", Math.abs(r9.r - 0.19) < 0.01)
      c.check(`${fam}: radius ratio at t=0.5 is ${r5.r.toFixed(3)} (want 0.71)`, "inspection", Math.abs(r5.r - 0.71) < 0.01)
      c.check(`${fam}: rounded tip radius ${tip.r.toFixed(3)} R (want 0.05)`, "inspection", Math.abs(tip.r - 0.05) < 0.01)
    }

    for (const fam of SATS) {
      const geo = buildGeo(fam)
      const g = geo.body
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
      for (let i = 0; i < g.verts; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], g.pos[i * 3 + k]); mx[k] = Math.max(mx[k], g.pos[i * 3 + k]) }
      const ext = mx.map((v, k) => v - mn[k])
      const thin = Math.min(...ext), wide = Math.max(...ext)
      const down = slotsUsed(geo, (nx, ny) => ny < -0.5), up = slotsUsed(geo, (nx, ny) => ny > 0.5)
      const grid = vertsOfSlot(geo, SLOT.GRID).length, cells = vertsOfSlot(geo, SLOT.CELL).length
      print(`[SH-TEST] ${fam}: extents ${ext.map((e) => e.toFixed(3)).join(" x ")}, ${g.tris} tris, materials seen from below ${down}, from above ${up}`)
      c.check(`${fam}: not a slab - thinnest extent ${(thin / wide).toFixed(2)} of widest`, "inspection", thin / wide > 0.1)
      c.check(`${fam}: detailed from below (${down} palette slots on down-facing faces)`, "inspection", down >= 3)
      c.check(`${fam}: detailed from above (${up} palette slots on up-facing faces)`, "inspection", up >= 3)
      c.check(`${fam}: solar-cell grid and darker back grid present`, "inspection", cells > 0 && grid > 0)
      c.check(`${fam}: ${g.tris} tris within 1500`, "inspection", g.tris <= 1500)
    }
}
