// SkyHangarMeshes.ts
// Owns: code-authored meshes (MeshBuilder) for the stylized models — a lathe (revolved profile) for
// smooth fuselages, nacelles, cabins and dishes, and a tapered swept slab for wings/stabilisers/fins.
// Meshes are unit-sized (fit their profile/plan box) and cached by key; PartKit.part() scales them.
// Expects: nothing. Must not: hold scene state.

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

/**
 * Tapered, swept slab in the XZ plane (span along +X from the root at x=0), thickness along Y.
 * rootChord, tipChord and sweep are fractions of the span; the mesh fits a unit box after scaling.
 */
export function wingMesh(key: string, rootChord: number, tipChord: number, sweep: number, thickness: number, mirror: boolean): RenderMesh {
  const k = "wing:" + key + (mirror ? ":m" : "")
  if (cache[k]) return cache[k]
  const b = newBuilder()
  const s = mirror ? -1 : 1
  const t = thickness / 2
  // root: x=0, z from -rootChord/2 .. +rootChord/2; tip: x=1, z offset by sweep
  const P = [
    [0, -rootChord / 2], [0, rootChord / 2], [1, sweep + tipChord / 2], [1, sweep - tipChord / 2]
  ].map((p) => [p[0] * s, p[1]])
  const top = P.map((p) => [p[0], t, p[1]])
  const bot = P.map((p) => [p[0], -t * 0.6, p[1]])
  const verts: number[] = []
  const idx: number[] = []
  const quad = (a: number[], bb: number[], c: number[], d: number[], n: number[]) => {
    const base = verts.length / 8
    for (const v of [a, bb, c, d]) verts.push(v[0], v[1], v[2], n[0], n[1], n[2], 0, 0)
    if (mirror) idx.push(base, base + 2, base + 1, base, base + 3, base + 2)
    else idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  quad(top[0], top[1], top[2], top[3], [0, 1, 0])
  quad(bot[3], bot[2], bot[1], bot[0], [0, -1, 0])
  quad(bot[0], top[0], top[3], bot[3], [0, 0, -1]) // leading edge
  quad(bot[1], bot[2], top[2], top[1], [0, 0, 1]) // trailing edge
  quad(bot[3], top[3], top[2], bot[2], [s, 0, 0]) // tip
  b.appendVerticesInterleaved(verts)
  b.appendIndices(idx)
  return finish(b, k, verts)
}

/** Smooth airliner fuselage: rounded nose, straight cabin, tapered and up-swept tail cone. */
export function fuselageRings(noseFrac: number, tailFrac: number, upsweep: number): number[][] {
  const rings: number[][] = []
  const N = 6
  for (let i = 0; i <= N; i++) {
    const u = i / N
    const z = -0.5 + u * noseFrac
    rings.push([z, 0.5 * Math.sqrt(Math.max(0.001, 1 - Math.pow(1 - u, 2))), 0])
  }
  for (let i = 1; i <= 3; i++) rings.push([-0.5 + noseFrac + (i / 3) * (1 - noseFrac - tailFrac), 0.5, 0])
  const M = 7
  for (let i = 1; i <= M; i++) {
    const u = i / M
    const z = 0.5 - tailFrac + u * tailFrac
    rings.push([z, 0.5 * (1 - 0.82 * Math.pow(u, 1.25)), upsweep * Math.pow(u, 1.6)])
  }
  return rings
}

/** Teardrop cabin (helicopter): bulbous front, tapering back. */
export function teardropRings(): number[][] {
  const rings: number[][] = []
  const N = 12
  for (let i = 0; i <= N; i++) {
    const u = i / N
    const z = -0.5 + u
    const r = u < 0.4 ? 0.5 * Math.sqrt(Math.max(0.001, 1 - Math.pow((0.4 - u) / 0.4, 2))) : 0.5 * (1 - 0.75 * Math.pow((u - 0.4) / 0.6, 1.4))
    rings.push([z, Math.max(0.02, r), 0.08 * Math.pow(Math.max(0, u - 0.4) / 0.6, 1.5)])
  }
  return rings
}

/** Engine nacelle: inlet lip, body, short exhaust taper. */
export function nacelleRings(): number[][] {
  return [[-0.5, 0.38, 0], [-0.46, 0.5, 0], [-0.3, 0.5, 0], [0.2, 0.46, 0], [0.4, 0.36, 0], [0.5, 0.26, 0]]
}

/** Shallow dish (satellite antenna), open side toward -Z. */
export function dishRings(): number[][] {
  return [[-0.5, 0.5, 0], [-0.2, 0.42, 0], [0.1, 0.28, 0], [0.35, 0.12, 0], [0.5, 0.02, 0]]
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
