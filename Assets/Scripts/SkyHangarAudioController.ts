// SkyHangarAudioController.ts
// Owns: every SkyHangar sound cue (tap, pull, throw, collect, menu). Input-reactive cues use
// LowLatency playback. Expects: nothing wired (fixed internal assets via requireAsset). Must not: decide when to play.

const TAP = requireAsset("../GeneratedSFX/SkyTap.wav") as AudioTrackAsset
const PULL = requireAsset("../GeneratedSFX/PullWhoosh.wav") as AudioTrackAsset
const THROW = requireAsset("../GeneratedSFX/ThrowSwish.wav") as AudioTrackAsset
const COLLECT = requireAsset("../GeneratedSFX/CollectChime.wav") as AudioTrackAsset
const MENU = requireAsset("../GeneratedSFX/MenuClick.wav") as AudioTrackAsset

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

  onAwake(): void {
    this.add("tap", TAP)
    this.add("pull", PULL)
    this.add("throw", THROW)
    this.add("collect", COLLECT)
    this.add("menu", MENU)
  }

  private add(key: string, track: AudioTrackAsset): void {
    const so = global.scene.createSceneObject("SFX_" + key)
    so.setParent(this.sceneObject)
    const a = so.createComponent("Component.AudioComponent") as AudioComponent
    a.audioTrack = track
    a.playbackMode = Audio.PlaybackMode.LowLatency
    a.volume = this.volume
    this.players[key] = a
  }

  play(key: "tap" | "pull" | "throw" | "collect" | "menu"): void {
    const a = this.players[key]
    if (!a) return
    if (a.isPlaying()) a.stop(false)
    a.play(1)
  }
}
