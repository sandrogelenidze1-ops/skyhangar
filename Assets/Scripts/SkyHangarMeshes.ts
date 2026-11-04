// SkyHangarMeshes.ts
// Owns: code-authored meshes (MeshBuilder): the lathe (revolved profile) used by the radar disc, the inverted sky-dome
// band, and the GeoBuilder -> RenderMesh bridge for the procedural models (SkyHangarModelGeo). Cached by key.
// Expects: nothing. Must not: hold scene state.

import {GeoBuilder, SLOT, V} from "./SkyHangarModelGeo"

const cache: {[key: string]: RenderMesh} = {}

/** Exact bounds of every mesh built here (MeshBuilder meshes may not report aabb reliably). */
export const MESH_BOUNDS: Map<RenderMesh, {min: vec3; max: vec3}> = new Map()

function finish(b: MeshBuilder, k: string, verts: number[]): RenderMesh {
  let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9
  for (let i = 0; i < verts.length; i += 8) {
    mnx = Math.min(mnx, verts[i]); mny = Math.min(mny, verts[i + 1]); mnz = Math.min(mnz, verts[i + 2])
    mxx = Math.max(mxx, verts[i]); mxy = Math.max(mxy, verts[i + 1]); mxz = Math.max(mxz, verts[i + 2])
  }
  b.updateMesh()
  const mesh = b.getMesh()
  MESH_BOUNDS.set(mesh, {min: new vec3(mnx, mny, mnz), max: new vec3(mxx, mxy, mxz)})
  cache[k] = mesh
  return mesh
}

function newBuilder(): MeshBuilder {
  const b = new MeshBuilder([
    {name: "position", components: 3},
    {name: "normal", components: 3, normalized: true},
    {name: "texture0", components: 2}
  ])
  b.topology = MeshTopology.Triangles
  b.indexType = MeshIndexType.UInt16
  return b
}

/**
 * Revolve a profile around the Z axis. rings: [z, radius, yOffset] from z=-0.5 (front) to +0.5 (back).
 * Ends are closed by collapsing to the first/last ring centre. segs = radial segments.
 */
export function latheMesh(key: string, rings: number[][], segs: number = 18): RenderMesh {
  const k = "lathe:" + key + ":" + segs
  if (cache[k]) return cache[k]
  const b = newBuilder()
  const verts: number[] = []
  const idx: number[] = []
  const n = rings.length
  for (let i = 0; i < n; i++) {
    const [z, r, yo] = rings[i]
    // normal tilt from neighbouring radii (smooth shading along the profile)
    const prev = rings[Math.max(0, i - 1)], next = rings[Math.min(n - 1, i + 1)]
    const dz = next[0] - prev[0] || 1e-4
    const dr = next[1] - prev[1]
    const slope = -dr / dz
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2
      const cx = Math.cos(a), cy = Math.sin(a)
      let nx = cx, ny = cy, nz = slope
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz)
      nx /= l; ny /= l; nz /= l
      verts.push(cx * r, cy * r + yo, z, nx, ny, nz, j / segs, i / (n - 1))
    }
  }
  const row = segs + 1
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * row + j, bb = a + 1, c = a + row, d = c + 1
      idx.push(a, c, bb, bb, c, d)
    }
  }
  // caps
  const capFront = verts.length / 8
  verts.push(0, rings[0][2], rings[0][0], 0, 0, -1, 0.5, 0)
  const capBack = verts.length / 8
  verts.push(0, rings[n - 1][2], rings[n - 1][0], 0, 0, 1, 0.5, 1)
  for (let j = 0; j < segs; j++) {
    idx.push(capFront, j + 1, j)
    const base = (n - 1) * row
    idx.push(capBack, base + j, base + j + 1)
  }
  b.appendVerticesInterleaved(verts)
  b.appendIndices(idx)
  return finish(b, k, verts)
}

/** Flat filled polygon (any simple outline, x / y, z = 0) facing +Z, by ear clipping. Cached by key. */
export function polygonMesh(key: string, outline: number[][]): RenderMesh {
  const k = "poly:" + key
  if (cache[k]) return cache[k]
  const pts = outline.slice()
  let area2 = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    area2 += a[0] * b[1] - b[0] * a[1]
  }
  if (area2 < 0) pts.reverse() // counter-clockwise seen from +Z
  const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const inTri = (p: number[], a: number[], b: number[], c: number[]) => cr(a, b, p) >= -1e-9 && cr(b, c, p) >= -1e-9 && cr(c, a, p) >= -1e-9
  const verts: number[] = []
  for (const p of pts) verts.push(p[0], p[1], 0, 0, 0, 1, p[0] + 0.5, p[1] + 0.5)
  const idx: number[] = []
  const rest = pts.map((_, i) => i)
  let guard = 0
  while (rest.length > 3 && guard++ < 10000) {
    let clipped = false
    for (let i = 0; i < rest.length; i++) {
      const ia = rest[(i + rest.length - 1) % rest.length], ib = rest[i], ic = rest[(i + 1) % rest.length]
      if (cr(pts[ia], pts[ib], pts[ic]) <= 1e-12) continue // reflex or flat corner
      if (rest.some((j) => j !== ia && j !== ib && j !== ic && inTri(pts[j], pts[ia], pts[ib], pts[ic]))) continue
      idx.push(ia, ib, ic)
      rest.splice(i, 1)
      clipped = true
      break
    }
    if (!clipped) break
  }
  if (rest.length === 3) idx.push(rest[0], rest[1], rest[2])
  const b = newBuilder()
  b.appendVerticesInterleaved(verts)
  b.appendIndices(idx)
  return finish(b, k, verts)
}

/** Mesh from a GeoBuilder's interleaved data (position, normal, palette uv); cached by key. Bounds are recorded exactly. */
export function geoMesh(key: string, geo: GeoBuilder): RenderMesh {
  const k = "geo:" + key
  if (cache[k]) return cache[k]
  const b = newBuilder()
  const verts = geo.interleaved()
  b.appendVerticesInterleaved(verts)
  b.appendIndices(geo.idx)
  return finish(b, k, verts)
}

/** Open band of a unit sphere between two elevations (radians), facing inward — for the backdrop sky dome. */
export function sphereBandMesh(key: string, e0: number, e1: number, segs: number = 48): RenderMesh {
  const k = "band:" + key + ":" + segs
  if (cache[k]) return cache[k]
  const b = newBuilder()
  const verts: number[] = []
  const idx: number[] = []
  for (const [row, e] of [[0, e0], [1, e1]]) {
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2
      const x = Math.cos(e) * Math.sin(a), y = Math.sin(e), z = -Math.cos(e) * Math.cos(a)
      verts.push(x, y, z, -x, -y, -z, j / segs, row)
    }
  }
  const rowN = segs + 1
  for (let j = 0; j < segs; j++) {
    const a = j, bb = j + 1, c = j + rowN, d = c + 1
    idx.push(a, bb, c, bb, d, c)
  }
  b.appendVerticesInterleaved(verts)
  b.appendIndices(idx)
  return finish(b, k, verts)
}

/**
 * One mesh for a whole ring of `n` boxes (instead of n objects): mid radius r, radial width w, height h. "xz" lies flat (up = +Y, seam at -Z like
 * the radar rings), "xy" stands in the XY plane (thickness along Z). Cached by key; bounds recorded, so pass the mesh bounds size to PartKit.part.
 */
export function ringMesh(key: string, r: number, w: number, h: number, n: number, plane: "xz" | "xy"): RenderMesh {
  const g = new GeoBuilder()
  const len = ((Math.PI * 2 * r) / n) * 1.02
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const sa = Math.sin(a), ca = Math.cos(a)
    const rad: V = plane === "xz" ? [sa, 0, -ca] : [ca, sa, 0]
    const tan: V = plane === "xz" ? [ca, 0, sa] : [-sa, ca, 0]
    const up: V = plane === "xz" ? [0, 1, 0] : [0, 0, 1]
    g.obox([rad[0] * r, rad[1] * r, rad[2] * r], [tan[0] * len / 2, tan[1] * len / 2, tan[2] * len / 2], [up[0] * h / 2, up[1] * h / 2, up[2] * h / 2], [rad[0] * w / 2, rad[1] * w / 2, rad[2] * w / 2], SLOT.WHITE)
  }
  return geoMesh("ring:" + key, g)
}
