// Round 1 item 7: sky markers are small (1.5-2 deg across), plane glyph nose along its heading,
// markers brighten when aimed at; the pinch target stays big (28 cm collider).
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {SKY_OBJECTS} from "../../../Scripts/SkyHangarFlightData"
import {skyDir, skyTangent} from "../../../Scripts/SkyHangarUtil"
import {Checks, getMain, waitReady, findChild, collectBaseColors, angleDeg} from "../SkyHangarTestKit"

/** Measured angular width (deg) of a glyph: extent of its meshes' world AABBs across the line of sight. */
function measuredDeg(marker: SceneObject, eye: vec3): number {
  const pts: vec3[] = []
  const walk = (o: SceneObject) => {
    const r = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (r) {
      const a = r.worldAabbMin()
      const b = r.worldAabbMax()
      pts.push(a.add(b).uniformScale(0.5))
      pts.push(a)
      pts.push(b)
    }
    for (let i = 0; i < o.getChildrenCount(); i++) walk(o.getChild(i))
  }
  walk(marker)
  const centre = marker.getTransform().getWorldPosition()
  const dir = centre.sub(eye).normalize()
  const right = dir.cross(vec3.up()).normalize()
  const up = right.cross(dir).normalize()
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
  // Use part centres for the extent (AABB corners overstate rotated thin parts) plus a half-thickness margin.
  for (let i = 0; i < pts.length; i += 3) {
    const p = pts[i].sub(centre)
    minX = Math.min(minX, p.dot(right)); maxX = Math.max(maxX, p.dot(right))
    minY = Math.min(minY, p.dot(up)); maxY = Math.max(maxY, p.dot(up))
  }
  const span = Math.max(maxX - minX, maxY - minY)
  return (2 * Math.atan(span / 2 / centre.distance(eye)) * 180) / Math.PI
}

@component
export class SH_N_MarkerGlyphs extends Scenario {
  async run(): Promise<void> {
    const c = new Checks("n_marker_glyphs")
    const main = getMain()
    await waitReady(main, c)
    const a = main.getSkyMarkerAngularSizeDeg()
    c.check("marker angular size 1.5-2.0 deg (API)", "inspection", a >= 1.5 && a <= 2.0, `${a.toFixed(2)} deg`)
    const eye = main.cameraObject.getTransform().getWorldPosition()
    for (const id of ["VS93", "VLZ05", "SAT25544"]) {
      const m = findSceneObjectByName("SkyMarker_" + id)
      const deg = m ? measuredDeg(m, eye) : -1
      c.check(`measured ${id} glyph width within the 1.5-2 deg family (part-centre extent <= 2.0 deg)`, "inspection", deg > 0.8 && deg <= 2.0, `${deg.toFixed(2)} deg`)
    }
    const col = findSceneObjectByName("SkyMarker_VS93").getComponent("Physics.ColliderComponent") as ColliderComponent
    const r = (col.shape as SphereShape).radius
    c.check("pinch target is still large (28 cm sphere collider)", "inspection", Math.abs(r - 28) < 0.5, `${r} cm`)

    // Heading: plane glyph nose (+Y of Visual) along its track on the sky.
    const bad: string[] = []
    for (const o of SKY_OBJECTS) {
      if (o.kind !== "plane") continue
      const v = findChild(findSceneObjectByName("SkyMarker_" + o.id), "Visual")
      const nose = v.getTransform().getWorldRotation().multiplyVec3(vec3.up())
      const tan = skyTangent(skyDir(o.skyAzimuthDeg, o.skyElevationDeg), o.trackDeg)
      const ang = angleDeg(nose, tan)
      if (ang > 5) bad.push(`${o.id}:${ang.toFixed(0)}deg`)
    }
    c.check("every plane glyph points along its heading (< 5 deg)", "inspection", bad.length === 0, bad.length ? bad.join(" ") : "12/12")

    // Brighten when aimed.
    const vis = findChild(findSceneObjectByName("SkyMarker_DL31"), "Visual")
    const alpha0 = collectBaseColors(vis)[0].w
    const s0 = vis.getTransform().getLocalScale().x
    main.aimAt("DL31")
    await sleep(600)
    const alpha1 = collectBaseColors(vis)[0].w
    const s1 = vis.getTransform().getLocalScale().x
    c.check("aimed marker brightens (alpha up)", "test hook", alpha1 > alpha0 + 0.05, `${alpha0.toFixed(2)} -> ${alpha1.toFixed(2)}`)
    c.check("aimed marker grows slightly", "test hook", s1 > s0 * 1.1, `${s0.toFixed(2)} -> ${s1.toFixed(2)}`)
    main.aimAt("")
    await sleep(600)
    c.check("un-aimed marker returns to normal", "test hook", Math.abs(vis.getTransform().getLocalScale().x - s0) < 0.03)
    // Icon size by distance: about 120% for the nearest aircraft down to 70% for the farthest; satellites at the small end.
    const scaleOf = (id: string) => findChild(findSceneObjectByName("SkyMarker_" + id), "Visual")!.getTransform().getLocalScale().x
    const flying = SKY_OBJECTS.filter((o) => o.kind !== "satellite").slice().sort((x, y) => x.distanceKm - y.distanceKm)
    const near = scaleOf(flying[0].id)
    const far = scaleOf(flying[flying.length - 1].id)
    c.check("nearest aircraft icon is about 120%", "inspection", Math.abs(near - 1.2) < 0.06, `${near.toFixed(2)}`)
    c.check("farthest aircraft icon is about 70%", "inspection", Math.abs(far - 0.7) < 0.06, `${far.toFixed(2)}`)
    const mid = flying.slice(1, -1).map((o) => scaleOf(o.id))
    c.check("icon size shrinks gently with distance", "inspection", flying.slice(0, -1).every((o, i) => scaleOf(o.id) >= scaleOf(flying[i + 1].id) - 0.01) && mid.every((m) => m < 1.21 && m > 0.69))
    c.finish()
  }
}
