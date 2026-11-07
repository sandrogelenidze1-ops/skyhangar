// SkyHangarAudioController.ts
// Owns: every SkyHangar sound. Nothing else in the Lens makes sound. Expects: nothing wired (fixed internal assets via requireAsset). Must not: decide when to play
// (SkyHangarMain triggers each cue from the event itself, never from an update loop). Everything is soft: the files are quiet, the gains sit on the one master `volume`.
//   menu  : ui_click on the bottom menu buttons (Routes, Radar, Hangar) and the Hangar shelf buttons: always identical (fixed volume 0.5, no variation, no fades, 2D)
//   drag  : drag_whoosh ONCE when a grab / drag starts (never repeated while holding)
//   sky   : sky_whoosh ONCE when the aircraft is let go in the sky (sent to the sky) and ONCE when it is thrown like a paper plane
//   inspect: when an aircraft is pinned from the Hangar for inspection, its own sound plays once at a steady 0.3 (no pitch / volume changes):
//     helicopter_inspect, plane_big_inspect (airliners), plane_private_jet_inspect (business jets), plane_propeller_inspect (turboprops / pistons);
//     satellites loop satellite_loop for 7 s (0.4 s fade in, 0.8 s fade out). Released or put back early: 0.4 s fade out and stop. One aircraft sound at a time.
//   collect: CollectChime (the original sound) once when the Collected sign appears, as it was originally (master volume, no extra fades).
//   No engine sounds when throwing.
// Each whoosh has a 0.5 s debounce.

import {familyForInfo} from "./SkyHangarModelFactory"

const COLLECT = requireAsset("../GeneratedSFX/CollectChime.wav") as AudioTrackAsset // the original "Collected" chime
const UI_CLICK = requireAsset("../Audio/SkyHangar/ui_click.wav") as AudioTrackAsset
const DRAG = requireAsset("../Audio/SkyHangar/drag_whoosh.wav") as AudioTrackAsset
const SKY = requireAsset("../Audio/SkyHangar/sky_whoosh.wav") as AudioTrackAsset
const INSPECT_HELI = requireAsset("../Audio/SkyHangar/helicopter_inspect.wav") as AudioTrackAsset
const INSPECT_BIG = requireAsset("../Audio/SkyHangar/plane_big_inspect.wav") as AudioTrackAsset
const INSPECT_JET = requireAsset("../Audio/SkyHangar/plane_private_jet_inspect.wav") as AudioTrackAsset
const INSPECT_PROP = requireAsset("../Audio/SkyHangar/plane_propeller_inspect.wav") as AudioTrackAsset
const SAT_LOOP = requireAsset("../Audio/SkyHangar/satellite_loop.wav") as AudioTrackAsset

const NOMINAL_MASTER = 0.8 // the default of `volume`: the gains below are what they say at this setting, and scale with the slider
const CLICK_GAIN = 0.5
const WHOOSH_GAIN = 0.35
const INSPECT_GAIN = 0.3
const DEBOUNCE_S = 0.5
const SAT_PLAY_S = 7 // the satellite loop plays for 7 s: 0.4 s fade in, 0.8 s fade out
const EARLY_FADE_S = 0.4 // released / put back early

export type AudioCue = "menu" | "drag" | "sky" | "collect"
export type InspectSound = "helicopter" | "big" | "private" | "propeller" | "satellite"
export interface AudioVehicle {id: string; kind: string; aircraftType: string; airlineIcao: string}

/** Which inspect sound an aircraft gets (pure): helicopters, satellites, then the model family (business jets / turboprops / pistons / airliners). */
export function inspectSoundFor(v: AudioVehicle): InspectSound {
  if (v.kind === "helicopter") return "helicopter"
  if (v.kind === "satellite") return "satellite"
  const f = familyForInfo({kind: "plane", aircraftType: v.aircraftType, id: v.id, airlineIcao: v.airlineIcao})
  if (f === "bizSmall" || f === "bizLarge") return "private"
  if (f === "turboprop") return "propeller"
  return "big" // narrowbody, widebody, large widebody, jumbo, superjumbo, regional airliners
}

interface Loop {id: string; so: SceneObject; comp: AudioComponent; endAt: number; stopAt: number}

@component
export class SkyHangarAudioController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarAudioController – sound cues</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Master volume for all SkyHangar sound effects")
  @widget(new SliderWidget(0, 1, 0.05))
  volume: number = 0.8
  @ui.group_end

  private players: {[key: string]: AudioComponent} = {}
  private lastAt: {[key: string]: number} = {}
  private inspect: Loop | null = null
  private fading: Loop[] = [] // stopped sounds waiting for their fade-out to finish before their object is destroyed

  onAwake(): void {
    this.addCollect()
    this.add("menu", UI_CLICK, CLICK_GAIN)
    this.add("drag", DRAG, WHOOSH_GAIN)
    this.add("sky", SKY, WHOOSH_GAIN)
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  private master(): number { return this.volume / NOMINAL_MASTER }

  private add(key: string, track: AudioTrackAsset, gain: number): void {
    const so = global.scene.createSceneObject("SFX_" + key)
    so.setParent(this.sceneObject)
    const a = so.createComponent("Component.AudioComponent") as AudioComponent
    a.audioTrack = track
    a.playbackMode = Audio.PlaybackMode.LowLatency
    const click = key === "menu"
    a.fadeInTime = click ? 0 : 0.03 // the click has no fades at all (a fade-in would shave its attack and change its loudness); the whooshes keep their short fades
    a.fadeOutTime = click ? 0 : 0.06
    a.spatialAudio.enabled = false // plain 2D playback: no distance or position-based volume
    a.volume = gain * this.master()
    this.players[key] = a
    this.lastAt[key] = -99
  }

  /** The "Collected" chime, exactly as it was originally: its own LowLatency player at the plain master volume, default fades, played once when the Collected sign appears. */
  private addCollect(): void {
    const so = global.scene.createSceneObject("SFX_collect")
    so.setParent(this.sceneObject)
    const a = so.createComponent("Component.AudioComponent") as AudioComponent
    a.audioTrack = COLLECT
    a.playbackMode = Audio.PlaybackMode.LowLatency
    a.volume = this.volume
    this.players.collect = a
  }

  /** One short sound for an event. Each cue has a 0.5 s debounce (a second trigger inside it is ignored). */
  play(key: AudioCue): void {
    const a = this.players[key]
    if (!a) return
    if (key === "collect") { // as originally: restart if still playing, play once, no debounce
      a.volume = this.volume
      if (a.isPlaying()) a.stop(false)
      a.play(1)
      return
    }
    if (key === "menu") {
      // Every click is identical: one fixed volume, no random variation, no debounce (so fast taps all click), and a click still playing is cut and the new one starts from its first sample.
      a.volume = CLICK_GAIN * this.master()
      a.stop(false)
      a.position = 0
      a.play(1)
      return
    }
    const now = getTime()
    if (now - this.lastAt[key] < DEBOUNCE_S) return
    this.lastAt[key] = now
    a.volume = WHOOSH_GAIN * this.master()
    if (a.isPlaying()) a.stop(true)
    a.play(1)
  }

  // ---------- inspect sound ----------
  private trackFor(s: InspectSound): AudioTrackAsset {
    return s === "helicopter" ? INSPECT_HELI : s === "big" ? INSPECT_BIG : s === "private" ? INSPECT_JET : s === "propeller" ? INSPECT_PROP : SAT_LOOP
  }

  /** The aircraft pinned from the Hangar for inspection (null = none). Its sound starts once when it is pinned; released / put back early = 0.4 s fade out and stop. */
  setInspect(v: AudioVehicle | null): void {
    if (v && this.inspect && this.inspect.id === v.id) return // already playing (or already played) for this aircraft: never restarts
    if (this.inspect) { this.release(this.inspect, EARLY_FADE_S); this.inspect = null }
    if (!v) return
    const kind = inspectSoundFor(v)
    const so = global.scene.createSceneObject("SFX_inspect_" + v.id)
    so.setParent(this.sceneObject)
    const a = so.createComponent("Component.AudioComponent") as AudioComponent
    a.audioTrack = this.trackFor(kind)
    a.playbackMode = Audio.PlaybackMode.LowPower
    a.volume = INSPECT_GAIN * this.master() // steady: nothing changes it while it plays
    const sat = kind === "satellite"
    a.fadeInTime = sat ? 0.4 : 0.03 // the other files carry their 0.4 s fade in / 0.8 s fade out in the audio itself
    a.fadeOutTime = sat ? 0.8 : EARLY_FADE_S
    a.play(sat ? -1 : 1)
    this.inspect = {id: v.id, so, comp: a, endAt: sat ? getTime() + SAT_PLAY_S - 0.8 : 0, stopAt: 0}
  }
  isInspectActive(): boolean { return !!this.inspect }

  private release(l: Loop, fade: number): void {
    if (l.comp && !isNull(l.comp)) {
      l.comp.fadeOutTime = fade
      if (l.comp.isPlaying()) l.comp.stop(true)
    }
    l.stopAt = getTime() + fade + 0.15
    this.fading.push(l)
  }

  private update(): void {
    if (!this.inspect && this.fading.length === 0) return
    const now = getTime()
    const ins = this.inspect
    if (ins && ins.endAt > 0 && now >= ins.endAt) { // the satellite loop's 7 s are up: 0.8 s fade out, then it is silent (it is not restarted while still inspected)
      ins.endAt = 0
      this.release(ins, 0.8)
    }
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const l = this.fading[i]
      if (now >= l.stopAt) {
        if (!isNull(l.so)) l.so.destroy()
        this.fading.splice(i, 1)
      }
    }
  }
}
