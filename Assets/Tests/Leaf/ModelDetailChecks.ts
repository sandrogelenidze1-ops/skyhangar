// Pure model-detail checks (no Lens globals) so the same assertions run in the LEAF scenario SH_M3_ModelDetail and in plain Node.
import {buildGeo, SLOT, PALETTE_SLOTS, CELL_PX} from "../../Scripts/SkyHangarModelGeo"
import type {ModelGeo, ModelFamily} from "../../Scripts/SkyHangarModelGeo"

export interface Check {
  check(name: string, input: "inspection", pass: boolean, detail?: string): boolean
}

const AIRLINERS: ModelFamily[] = ["narrowbody", "widebody", "largeWidebody", "jumbo", "superjumbo", "regional", "turboprop"]
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
      // windscreen: one continuous visor on the sloping upper front; numbers come from the triangles themselves (area-weighted)
      const ws = geo.windscreen ?? []
      const g = geo.body
      let nx = 0, ny = 0, nz = 0, area = 0, cz = 0
      let topRoof = 0
      for (const p of ws) for (let t = p.tri0; t < p.tri1; t++) {
        const i = [g.idx[t * 3], g.idx[t * 3 + 1], g.idx[t * 3 + 2]].map((k) => [g.pos[k * 3], g.pos[k * 3 + 1], g.pos[k * 3 + 2]])
        const e1 = [i[1][0] - i[0][0], i[1][1] - i[0][1], i[1][2] - i[0][2]], e2 = [i[2][0] - i[0][0], i[2][1] - i[0][1], i[2][2] - i[0][2]]
        const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cw = e1[0] * e2[1] - e1[1] * e2[0]
        nx += cx; ny += cy; nz += cw
        const a = Math.hypot(cx, cy, cw) / 2
        area += a
        cz += a * ((i[0][2] + i[1][2] + i[2][2]) / 3)
      }
      const nl = Math.hypot(nx, ny, nz) || 1
      const fwd = -nz / nl, upd = ny / nl // nose points toward -z
      const cD = (cz / (area || 1) - fus.zNose) / fus.D, cL = (cz / (area || 1) - fus.zNose) / fus.L
      // no glass on the roof behind the windscreen (passenger windows are 25 deg above the midline, far from ny > 0.85)
      for (const v of vertsOfSlot(geo, SLOT.GLASS)) if (v[4] > 0.85 && (v[2] - fus.zNose) / fus.D > 1.95) topRoof++
      print(`[SH-TEST] ${fam} windscreen: ${ws.length} visor, normal.forward ${fwd.toFixed(2)}, normal.up ${upd.toFixed(2)}, centroid ${cD.toFixed(2)} D = ${(cL * 100).toFixed(1)} % L behind the tip`)
      c.check(`${fam}: windscreen is one continuous visor`, "inspection", ws.length === 1)
      c.check(`${fam}: windscreen faces forward (dot fwd ${fwd.toFixed(2)} >= 0.35)`, "inspection", fwd >= 0.35)
      c.check(`${fam}: windscreen faces up only a little (dot up ${upd.toFixed(2)} in 0.25..0.95)`, "inspection", upd >= 0.25 && upd <= 0.95)
      c.check(`${fam}: windscreen centroid ${cD.toFixed(2)} D (${(cL * 100).toFixed(1)} % L) behind the tip, inside 0.8..1.9 D and the first 12 % of L`, "inspection", cD >= 0.8 && cD <= 1.9 && cL <= 0.12)
      c.check(`${fam}: no flat glass along the roof behind the nose`, "inspection", topRoof === 0)
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
      c.check(`${fam}: no clear-glass slot, no glass on the back or top of the tail boom`, "inspection", vertsOfSlot(geo, SLOT.CLEAR).length === 0)
      // every glass triangle faces outward from the hull (normal . vector from the body axis > 0); glass only in the cabin (front 55 % of the body), never on the roof
      const g = geo.body
      let inward = 0, tris = 0, aft = 0, zMin = 1e9, zMax = -1e9
      for (let i = 0; i < g.verts; i++) { zMin = Math.min(zMin, g.pos[i * 3 + 2]); zMax = Math.max(zMax, g.pos[i * 3 + 2]) }
      const gu = slotU(SLOT.GLASS)
      for (let t = 0; t < g.tris; t++) {
        const k = [g.idx[t * 3], g.idx[t * 3 + 1], g.idx[t * 3 + 2]]
        if (Math.abs(g.uv[k[0] * 2] - gu) > 1e-6) continue
        const p = k.map((q) => [g.pos[q * 3], g.pos[q * 3 + 1], g.pos[q * 3 + 2]])
        const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]]
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
        const cx = (p[0][0] + p[1][0] + p[2][0]) / 3, cy = (p[0][1] + p[1][1] + p[2][1]) / 3, cz = (p[0][2] + p[1][2] + p[2][2]) / 3
        tris++
        if (n[0] * cx + n[1] * cy < 0) inward++
        if ((cz - zMin) / (zMax - zMin) > 0.55) aft++
      }
      c.check(`${fam}: glass face normals point outward (${inward} of ${tris} inward)`, "inspection", tris > 0 && inward === 0)
      c.check(`${fam}: no glass on the tail boom (${aft} aft tris)`, "inspection", aft === 0)
    }

    // airliner nose: smooth ogive, full radius -> ~0.12 R tip over ~1.5 D, tip a little below the centreline
    for (const fam of AIRLINERS) {
      if (fam === "turboprop") continue
      const geo = buildGeo(fam), fus = geo.fus!, g = geo.body
      const slab = (d0: number, d1: number) => {
        let w = 0, ymin = 1e9, n = 0
        for (let i = 0; i < g.verts; i++) {
          const d = (g.pos[i * 3 + 2] - fus.zNose) / fus.D
          if (d < d0 || d > d1) continue
          w = Math.max(w, Math.abs(g.pos[i * 3])); ymin = Math.min(ymin, g.pos[i * 3 + 1]); n++
        }
        return {r: w / (fus.D / 2), ymin: ymin / fus.D, n}
      }
      const tip = slab(0, 0.04), mid = slab(0.7, 0.8), end = slab(1.45, 1.55)
      print(`[SH-TEST] ${fam} nose radius/R: tip ${tip.r.toFixed(2)}, 0.75D ${mid.r.toFixed(2)}, 1.5D ${end.r.toFixed(2)}; tip y ${tip.ymin.toFixed(3)} D`)
      c.check(`${fam}: nose tip radius ${tip.r.toFixed(2)} R is small but not a spike (0.05..0.4)`, "inspection", tip.r >= 0.05 && tip.r <= 0.4)
      c.check(`${fam}: nose narrows clearly (0.75 D radius ${mid.r.toFixed(2)} R in 0.5..0.92 - not a hemisphere or a cone)`, "inspection", mid.r >= 0.5 && mid.r <= 0.92)
      c.check(`${fam}: nose reaches full radius by ~1.5-1.7 D (${end.r.toFixed(2)} R at 1.5 D)`, "inspection", end.r >= 0.85)
      c.check(`${fam}: nose tip sits below the centreline (${tip.ymin.toFixed(3)} D)`, "inspection", tip.ymin < -0.05 && tip.ymin > -0.2)
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
