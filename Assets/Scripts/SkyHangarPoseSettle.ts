// SkyHangarPoseSettle.ts
// Owns: detecting when the preview camera's pose has settled (the editor preview can report a different head position on the first frames).
// Expects: update(worldPos) called once per frame. Must not: touch the scene.

/** Settled once the position moved less than tolCm per frame for minFrames consecutive frames AND at least minSeconds have passed since the Lens started. Stays settled. */
export class PoseSettle {
  settled = false
  private last: vec3 | null = null
  private still = 0

  constructor(private readonly minSeconds: number = 1, private readonly minFrames: number = 15, private readonly tolCm: number = 1) {}

  update(pos: vec3): boolean {
    if (this.settled) return true
    if (this.last && pos.distance(this.last) < this.tolCm) this.still++
    else this.still = 0
    this.last = pos
    if (this.still >= this.minFrames && getTime() >= this.minSeconds) this.settled = true
    return this.settled
  }
}
