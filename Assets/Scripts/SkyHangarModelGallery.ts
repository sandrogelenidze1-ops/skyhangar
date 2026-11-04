// SkyHangarModelGallery.ts
// Owns: a review-only gallery that lays every procedural model out in a labelled grid at one stable scale, rotating
// slowly. OFF by default: tick "Show Gallery" in the Inspector to build it in front of the camera, untick to remove it.
// Tilt / yaw / spin inputs let a reviewer look from the front, side, top, rear and three-quarter angles.
// Expects @inputs: sky (for the PartKit), cameraObject. Must not: touch gameplay, UI or any other controller.

import {SkyKind} from "./SkyHangarFlightData"
import {SkyHangarSkyController} from "./SkyHangarSkyController"
import {buildModel, BuiltModel, spinRotors, styleFor, modelFamilyFor} from "./SkyHangarModelFactory"
import {makeObj} from "./SkyHangarUtil"
import {applyTextRole} from "./SkyHangarSharedUI"

interface Entry {label: string; kind: SkyKind; type: string}

const ENTRIES: Entry[] = [
  {label: "Narrowbody", kind: "plane", type: "A320"},
  {label: "Widebody", kind: "plane", type: "A359"},
  {label: "Large widebody", kind: "plane", type: "B77W"},
  {label: "Jumbo (hump)", kind: "plane", type: "B744"},
  {label: "Super jumbo", kind: "plane", type: "A388"},
  {label: "Regional jet", kind: "plane", type: "E190"},
  {label: "Turboprop", kind: "plane", type: "AT72"},
  {label: "Private jet S", kind: "plane", type: "C25B"},
  {label: "Private jet L", kind: "plane", type: "GLF6"},
  {label: "Heli light piston", kind: "helicopter", type: "R44"},
  {label: "Heli light turbine", kind: "helicopter", type: "B06"},
  {label: "Heli medium twin", kind: "helicopter", type: "EC35"},
  {label: "Heli large", kind: "helicopter", type: "S92"},
  {label: "Heli tandem", kind: "helicopter", type: "CH47"},
  {label: "CubeSat", kind: "satellite", type: "CUBESAT"},
  {label: "Comms sat", kind: "satellite", type: "HST"},
  {label: "Flat panel", kind: "satellite", type: "NOAA 19"},
  {label: "Station", kind: "satellite", type: "ISS"}
]

@component
export class SkyHangarModelGallery extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarModelGallery – model review grid</span>')
  @ui.separator
  @input
  @hint("Camera SceneObject (the gallery is placed in front of it when shown)")
  cameraObject!: SceneObject
  @input
  @hint("Sky controller (provides the shared PartKit)")
  sky!: SkyHangarSkyController
  @input
  @hint("Tick to show the gallery of every model; untick to hide it")
  showGallery: boolean = false
  @input
  @hint("Slow turntable spin (revolutions per second); 0 freezes the yaw")
  spinRevPerSec: number = 0.08
  @input
  @hint("Static yaw in degrees when spin is 0 (0 = nose toward the viewer's left, 180 = rear view)")
  yawDeg: number = 0
  @input
  @hint("Pitch in degrees: 0 = side-on, 90 = top view, 30 = three-quarter from above")
  tiltDeg: number = 20
  @input
  @hint("Rotor revolutions per second (>= 3 also shows the blur discs)")
  rotorRevPerSec: number = 1.2
  @input
  @hint("Only show entries whose label contains this text (empty = all); the cells grow to fill the view")
  filter: string = ""
  @input
  @hint("Distance in front of the camera, cm")
  distanceCm: number = 110
  @input
  @hint("Grid cell size, cm (models are scaled to fit)")
  cellCm: number = 15

  private root: SceneObject | null = null
  private models: BuiltModel[] = []
  private holders: SceneObject[] = []
  private yaw = 0
  private shown = false
  private builtFilter = ""

  onAwake(): void {
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  private update(): void {
    if (this.shown && this.builtFilter !== this.filter) this.clear()
    if (this.showGallery && !this.shown) this.build()
    else if (!this.showGallery && this.shown) this.clear()
    if (!this.shown) return
    const dt = getDeltaTime()
    this.yaw += this.spinRevPerSec * dt * Math.PI * 2
    const yaw = this.spinRevPerSec === 0 ? this.yawDeg * (Math.PI / 180) : this.yaw
    const q = quat.angleAxis(this.tiltDeg * (Math.PI / 180), vec3.right()).multiply(quat.angleAxis(yaw, vec3.up()))
    for (const h of this.holders) h.getTransform().setLocalRotation(q)
    for (const m of this.models) spinRotors(m, dt, this.rotorRevPerSec)
  }

  private clear(): void {
    if (this.root && !isNull(this.root)) this.root.destroy()
    this.root = null
    this.models = []
    this.holders = []
    this.shown = false
  }

  private build(): void {
    const kit = this.sky ? this.sky.partKit : null
    if (!kit || !this.cameraObject) {
      print("SkyHangarModelGallery: sky / cameraObject not wired")
      return
    }
    this.shown = true
    this.builtFilter = this.filter
    const root = makeObj(this.sceneObject, "ModelGalleryRoot")
    this.root = root
    const cam = this.cameraObject.getTransform()
    const fwd = cam.back
    const flat = new vec3(fwd.x, 0, fwd.z)
    const dir = flat.length > 0.001 ? flat.normalize() : new vec3(0, 0, -1)
    const origin = cam.getWorldPosition().add(dir.uniformScale(this.distanceCm))
    root.getTransform().setWorldPosition(origin)
    // face the viewer (yaw only): the root's +Z points back at the camera
    root.getTransform().setWorldRotation(quat.lookAt(dir.uniformScale(-1), vec3.up()))
    const list = ENTRIES.filter((e) => !this.filter || (e.label + " " + e.type).toLowerCase().indexOf(this.filter.toLowerCase()) >= 0)
    const cols = Math.min(6, Math.max(1, list.length))
    const rows = Math.ceil(list.length / cols)
    const cellCm = list.length <= 2 ? this.cellCm * 2.6 : list.length <= 6 ? this.cellCm * 1.4 : this.cellCm
    let tris = 0, calls = 0
    list.forEach((e, i) => {
      const col = i % cols, row = Math.floor(i / cols)
      const cell = makeObj(root, "Cell_" + e.label)
      cell.getTransform().setLocalPosition(new vec3((col - (cols - 1) / 2) * cellCm, ((rows - 1) / 2 - row) * cellCm * 1.15, 0))
      const holder = makeObj(cell, "Turntable")
      const span = cellCm * (e.kind === "helicopter" ? 0.78 : 0.82)
      const m = buildModel(kit, holder, "Gallery_" + e.type, e.kind, span, styleFor([], e.kind, true, e.type), e.type)
      this.models.push(m)
      this.holders.push(holder)
      tris += m.tris
      calls += m.drawCalls
      const lab = makeObj(cell, "Label")
      lab.getTransform().setLocalPosition(new vec3(0, -cellCm * 0.46, 0))
      const t = lab.createComponent("Component.Text") as Text
      t.text = e.label + "\n" + modelFamilyFor(e.kind, e.type) + " · " + m.tris + " tris"
      applyTextRole(t, "Label", this.distanceCm)
      t.size = Math.round(t.size * 0.62)
      t.textFill.color = new vec4(1, 1, 1, 1)
      t.horizontalAlignment = HorizontalAlignment.Center
      t.verticalAlignment = VerticalAlignment.Center
      t.depthTest = false
    })
    print(`[Gallery] ${ENTRIES.length} models, ${tris} tris, ${calls} draw calls`)
  }
}
