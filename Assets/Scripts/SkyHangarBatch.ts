// SkyHangarBatch.ts
// Owns: a tiny static mesh batcher for the PREVIEW-ONLY backdrop. Boxes, prisms, cones, cylinders and quads are appended into one big mesh per
// material, so a whole city (or the whole roof) costs a handful of draw calls instead of one per object. Built once at startup, never per frame.
// Must not: hold any per-frame logic.

import {makeObj} from "./SkyHangarUtil"

type V3 = number[]

export class MeshBatch {
  private chunks: {v: number[]; i: number[]; n: number}[] = [{v: [], i: [], n: 0}]
  get count(): number { return this.chunks.reduce((a, c) => a + c.n, 0) }

  private cur(add: number) {
    let c = this.chunks[this.chunks.length - 1]
    if (c.n + add > 64000) {
      c = {v: [], i: [], n: 0}
      this.chunks.push(c)
    }
    return c
  }

  /** A position in the batch (chunk index, float offset), to scale only what is appended after it. */
  mark(): number[] { const c = this.chunks[this.chunks.length - 1]; return [this.chunks.length - 1, c.v.length] }
  /** Uniformly scale (by k, about the point o) every vertex appended since `m`. Normals are unchanged (uniform scale). Vertex layout: position 3, normal 3, uv 2. */
  scaleSince(m: number[], o: V3, k: number): void {
    for (let ci = m[0]; ci < this.chunks.length; ci++) {
      const v = this.chunks[ci].v
      for (let j = ci === m[0] ? m[1] : 0; j < v.length; j += 8) {
        v[j] = o[0] + (v[j] - o[0]) * k; v[j + 1] = o[1] + (v[j + 1] - o[1]) * k; v[j + 2] = o[2] + (v[j + 2] - o[2]) * k
      }
    }
  }

  /** One quad, corners in counter-clockwise order seen from the front: bottom-left, bottom-right, top-right, top-left. */
  quad(a: V3, b: V3, c: V3, d: V3, nx: number, ny: number, nz: number, uv: number[]): void {
    const k = this.cur(4)
    k.v.push(a[0], a[1], a[2], nx, ny, nz, uv[0], uv[1], b[0], b[1], b[2], nx, ny, nz, uv[2], uv[1], c[0], c[1], c[2], nx, ny, nz, uv[2], uv[3], d[0], d[1], d[2], nx, ny, nz, uv[0], uv[3])
    k.i.push(k.n, k.n + 1, k.n + 2, k.n, k.n + 2, k.n + 3)
    k.n += 4
  }

  /** Box centred at (cx, cy, cz), size (sx, sy, sz), rotated about +Y by yaw (radians, same convention as quat.angleAxis(yaw, up)). */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw: number, uv: number[], uvTop?: number[]): void {
    const c = Math.cos(yaw), s = Math.sin(yaw)
    const hx = sx / 2, hy = sy / 2, hz = sz / 2
    const P = (lx: number, ly: number, lz: number): V3 => [cx + lx * c + lz * s, cy + ly, cz - lx * s + lz * c]
    const N = (nx: number, nz: number): number[] => [nx * c + nz * s, -nx * s + nz * c]
    let n = N(0, 1)
    this.quad(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), n[0], 0, n[1], uv)
    n = N(0, -1)
    this.quad(P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), n[0], 0, n[1], uv)
    n = N(1, 0)
    this.quad(P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), n[0], 0, n[1], uv)
    n = N(-1, 0)
    this.quad(P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), n[0], 0, n[1], uv)
    this.quad(P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), 0, 1, 0, uvTop || uv)
  }

  /** Vertical prism / cone along +Y: radius r at the bottom, r * topScale at the top (0 = a cone), `sides` flat faces. */
  prism(cx: number, cy: number, cz: number, r: number, h: number, sides: number, uv: number[], topScale: number = 1): void {
    const u = (uv[0] + uv[2]) / 2, v = (uv[1] + uv[3]) / 2
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2
      const am = (a0 + a1) / 2
      const nx = Math.sin(am), nz = Math.cos(am)
      const kk = this.cur(4)
      const rt = r * topScale
      kk.v.push(
        cx + Math.sin(a0) * r, cy, cz + Math.cos(a0) * r, nx, 0.2, nz, u, v,
        cx + Math.sin(a1) * r, cy, cz + Math.cos(a1) * r, nx, 0.2, nz, u, v,
        cx + Math.sin(a1) * rt, cy + h, cz + Math.cos(a1) * rt, nx, 0.2, nz, u, v,
        cx + Math.sin(a0) * rt, cy + h, cz + Math.cos(a0) * rt, nx, 0.2, nz, u, v)
      kk.i.push(kk.n, kk.n + 1, kk.n + 2, kk.n, kk.n + 2, kk.n + 3)
      kk.n += 4
    }
    if (topScale > 0.05) {
      // flat lid
      const rt = r * topScale
      for (let k = 0; k < sides; k++) {
        const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2
        const kk = this.cur(3)
        kk.v.push(cx, cy + h, cz, 0, 1, 0, u, v, cx + Math.sin(a1) * rt, cy + h, cz + Math.cos(a1) * rt, 0, 1, 0, u, v, cx + Math.sin(a0) * rt, cy + h, cz + Math.cos(a0) * rt, 0, 1, 0, u, v)
        kk.i.push(kk.n, kk.n + 1, kk.n + 2)
        kk.n += 3
      }
    }
  }

  /** Cylinder between two points (any axis), radius r. */
  cylinder(p0: V3, p1: V3, r: number, sides: number, uv: number[]): void {
    const ax = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
    const len = Math.hypot(ax[0], ax[1], ax[2])
    if (len < 0.001) return
    const w = [ax[0] / len, ax[1] / len, ax[2] / len]
    const ref = Math.abs(w[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
    let uu = [w[1] * ref[2] - w[2] * ref[1], w[2] * ref[0] - w[0] * ref[2], w[0] * ref[1] - w[1] * ref[0]]
    const ul = Math.hypot(uu[0], uu[1], uu[2])
    uu = [uu[0] / ul, uu[1] / ul, uu[2] / ul]
    const vv = [w[1] * uu[2] - w[2] * uu[1], w[2] * uu[0] - w[0] * uu[2], w[0] * uu[1] - w[1] * uu[0]]
    const tu = (uv[0] + uv[2]) / 2, tv = (uv[1] + uv[3]) / 2
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2, am = (a0 + a1) / 2
      const rad = (a: number) => [uu[0] * Math.cos(a) + vv[0] * Math.sin(a), uu[1] * Math.cos(a) + vv[1] * Math.sin(a), uu[2] * Math.cos(a) + vv[2] * Math.sin(a)]
      const r0 = rad(a0), r1 = rad(a1), rm = rad(am)
      const kk = this.cur(4)
      kk.v.push(
        p0[0] + r0[0] * r, p0[1] + r0[1] * r, p0[2] + r0[2] * r, rm[0], rm[1], rm[2], tu, tv,
        p0[0] + r1[0] * r, p0[1] + r1[1] * r, p0[2] + r1[2] * r, rm[0], rm[1], rm[2], tu, tv,
        p1[0] + r1[0] * r, p1[1] + r1[1] * r, p1[2] + r1[2] * r, rm[0], rm[1], rm[2], tu, tv,
        p1[0] + r0[0] * r, p1[1] + r0[1] * r, p1[2] + r0[2] * r, rm[0], rm[1], rm[2], tu, tv)
      kk.i.push(kk.n, kk.n + 1, kk.n + 2, kk.n, kk.n + 2, kk.n + 3)
      kk.n += 4
    }
  }

  /** Turn the batch into mesh objects under `parent` (more than one only past 64k vertices). Returns the objects. */
  build(parent: SceneObject, name: string, mat: Material, order: number): SceneObject[] {
    const out: SceneObject[] = []
    this.chunks.forEach((c, idx) => {
      if (c.n === 0) return
      const b = new MeshBuilder([
        {name: "position", components: 3},
        {name: "normal", components: 3, normalized: true},
        {name: "texture0", components: 2}
      ])
      b.topology = MeshTopology.Triangles
      b.indexType = MeshIndexType.UInt16
      b.appendVerticesInterleaved(c.v)
      b.appendIndices(c.i)
      b.updateMesh()
      const o = makeObj(parent, name + (idx ? "_" + idx : ""))
      const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
      rmv.mesh = b.getMesh()
      rmv.mainMaterial = mat
      rmv.setRenderOrder(order)
      out.push(o)
    })
    return out
  }
}
