// SkyHangarPerf.ts
// Owns: a render census of the live scene (draw calls, triangles, unique materials / textures, heaviest groups). Debug / test only.

export interface Census {calls: number; tris: number; mats: number; texs: number; groups: {[g: string]: {calls: number; tris: number}}}

const triCache = new Map<RenderMesh, number>()
function meshTris(m: RenderMesh): number {
  let t = triCache.get(m)
  if (t === undefined) {
    try { t = m.getIndexBuffer().length / 3 } catch (e) { t = 0 }
    triCache.set(m, t)
  }
  return t
}

export function takeCensus(): Census {
  const out: Census = {calls: 0, tris: 0, mats: 0, texs: 0, groups: {}}
  const mats = new Set<Material>()
  const texs = new Set<Texture>()
  const walk = (o: SceneObject, path: string[]) => {
    if (!o.enabled) return
    const p = path.concat(o.name.replace(/_.*$/, ""))
    const vis = o.getComponents("Component.MaterialMeshVisual") as MaterialMeshVisual[]
    for (const v of vis) {
      if (!v.enabled) continue
      out.calls++
      let tris = 2
      if (v.getTypeName() === "Component.RenderMeshVisual") {
        const mesh = (v as RenderMeshVisual).mesh
        if (mesh) tris = meshTris(mesh)
      }
      out.tris += tris
      const g = p.slice(0, 3).join("/")
      const e = out.groups[g] ?? (out.groups[g] = {calls: 0, tris: 0})
      e.calls++
      e.tris += tris
      const m = v.mainMaterial
      if (m) {
        mats.add(m)
        const t = m.mainPass.baseTex
        if (t) texs.add(t)
      }
    }
    for (let i = 0; i < o.getChildrenCount(); i++) walk(o.getChild(i), p)
  }
  for (let i = 0; i < global.scene.getRootObjectsCount(); i++) walk(global.scene.getRootObject(i), [])
  out.mats = mats.size
  out.texs = texs.size
  return out
}

export function censusLine(tag: string, c: Census): string {
  const top = Object.keys(c.groups).sort((a, b) => c.groups[b].calls - c.groups[a].calls).slice(0, 6).map((g) => `${g}=${c.groups[g].calls}c/${c.groups[g].tris}t`)
  return `[SH-PERF] ${tag}: ${c.calls} draw calls, ${c.tris} tris, ${c.mats} materials, ${c.texs} textures | top: ${top.join("  ")}`
}

