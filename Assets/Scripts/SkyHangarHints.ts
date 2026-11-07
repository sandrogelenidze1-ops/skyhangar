// SkyHangarHints.ts
// Owns: WHICH one-line coaching hint is showing (pure logic, no Lens globals; the glass pill itself is drawn by SkyHangarLabelsUI).
// Five hints, one at a time, each only while it is relevant, each gone as soon as the user does the action, and each shown at most once per session:
//   aiming at an aircraft -> pinned -> holding it -> holding it over the drop zones; and in the Hangar.
// Priority when several are true: drop zones > holding > Hangar > pinned > aiming.

export type HintKey = "aim" | "pin" | "throw" | "drop" | "hangar"

export const HINT_TEXT: {[k in HintKey]: string} = {
  aim: "Pinch to pin it",
  pin: "Pinch and drag the model",
  throw: "Let go to throw it like a paper plane",
  drop: "Hangar: keep it · Sky: release it",
  hangar: "Pinch a model to take it out"
}

export interface HintState {
  mode: string // "sky" | "radar" | "hangar"
  aiming: boolean // an aircraft is aimed at (not yet pinned)
  pinned: boolean // an aircraft is pinned
  holding: boolean // a model is in the hand
  overPad: boolean // the held model is over a drop zone
  busy: boolean // something else owns the view (e.g. the model is flying / thrown)
}

export class HintLogic {
  private done: {[k: string]: boolean} = {}
  private current: HintKey | null = null

  /** The hint to show now (null = none). Call every frame (cheap). */
  update(s: HintState): HintKey | null {
    const idle = !s.holding && !s.busy
    let cand: HintKey | null = null
    if (s.holding && s.overPad) cand = "drop"
    else if (s.holding) cand = "throw"
    else if (idle && s.mode === "hangar") cand = "hangar"
    else if (idle && s.mode === "sky" && s.pinned) cand = "pin"
    else if (idle && s.mode === "sky" && s.aiming && !s.pinned) cand = "aim"
    if (cand && this.done[cand] && cand !== this.current) cand = null // already shown this session
    if (cand !== this.current) {
      if (this.current) this.done[this.current] = true // it ended (the user acted, or it stopped being relevant): never again
      this.current = cand
    }
    return this.current
  }

  getCurrent(): HintKey | null { return this.current }
  hasShown(k: HintKey): boolean { return !!this.done[k] || this.current === k }
  reset(): void { this.done = {}; this.current = null }
}
