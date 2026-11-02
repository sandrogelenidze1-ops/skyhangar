// SkyHangarPreviewBackdrop.ts
// Owns: the PREVIEW-ONLY procedural sky under the PreviewBackdrop object — gradient dome with sun/horizon glow,
// three soft drifting cloud layers, stars and a moon, all driven by one "Time of Day" value (0 day, 0.5 dusk, 1 night).
// Everything is generated at runtime into procedural textures (dithered, so no banding); no photo assets.
// Disables itself on a real device (deviceInfoSystem.isEditor()). The skyline stays in SkyHangarRooftopBackdrop;
// this script only hides that script's old banded dusk dome and clouds once they exist.
// Must not: touch any UI, card, trail, marker, hangar or radar object.

import {makeObj, luminanceFloor, largeSurfaceFloor, minLuminance, horizonStepCompensate, STEP_MAX_C, EDITOR_EDGE_DEG} from "./SkyHangarUtil"

const DEG = Math.PI / 180
const R = 6000
const ORDER = -400

type RGB = [number, number, number]

// Colour stops by elevation (degrees): [deg, r, g, b]. Dusk is the look the project already had.
const DAY_STOPS: number[][] = [[-6, 0.4, 0.64, 0.92], [0, 0.44, 0.69, 0.95], [10, 0.3, 0.58, 0.94], [30, 0.17, 0.45, 0.88], [60, 0.1, 0.35, 0.8], [90, 0.07, 0.28, 0.72]]
const DUSK_STOPS: number[][] = [[-6, 0.95, 0.42, 0.18], [0, 1.0, 0.55, 0.24], [7, 0.92, 0.4, 0.4], [20, 0.55, 0.3, 0.6], [45, 0.2, 0.18, 0.46], [90, 0.07, 0.1, 0.3]]
// Night: top #0A0F2E, mid #1B2060, horizon #3A2C70, faint city glow #6B3F8F (boosted in saturation at lookup, see nightStop)
// Ground colour of the lower hemisphere [day, dusk, night]: a mid-tone, hazy ground, never near-black (dark lens pixels are see-through in the preview)
const GROUND_COLORS: RGB[] = [[0.5, 0.54, 0.6], [0.5, 0.36, 0.44], [0.4, 0.3, 0.52]]
// The preview dims everything below the horizon by a measured per-channel ratio (146,196,255 -> 124,182,246 at the horizon); below the
// horizon we multiply by the inverse (editor only: this whole script is disabled on a device), eased over +-0.5 deg so there is no seam.
const STEP_BAND_DEG = 0.15
// Where the step really sits: the editor floor plane is finite, and its far edge is about 2 degrees below the true horizon (measured against
// the roof railing, whose elevations are known). The dim half-plane covers only elevations below this.
const GROUND_BLEND_DEG = 14 // the horizon colour eases into the ground colour over this many degrees below the horizon
const NIGHT_STOPS: number[][] = [[-6, 0.42, 0.247, 0.56], [0, 0.42, 0.247, 0.56], [3, 0.3, 0.2, 0.5], [9, 0.227, 0.173, 0.44], [30, 0.106, 0.125, 0.376], [60, 0.07, 0.09, 0.27], [90, 0.039, 0.059, 0.18]]

const SUN_COLORS: RGB[] = [[1.0, 0.96, 0.82], [1.0, 0.62, 0.3], [0.5, 0.55, 0.9]]
const SUN_WIDE = [0.12, 0.55, 0]
const SUN_CORE = [0.55, 0.85, 0]
const SUN_ELEVATION = [55, 2, -24]
const SUN_AZIMUTH = 20 * DEG
const SUN_DIST = 2500

// Cloud layers: [radius, drift deg/s, seed, tint day, tint dusk, tint night, alpha day/dusk/night]
const CLOUD_LAYERS: {radius: number; drift: number; seed: number; tint: RGB[]; alpha: number[]}[] = [
  {radius: 5950, drift: 0.22, seed: 11, tint: [[0.97, 0.98, 1.0], [1.0, 0.6, 0.42], [0.5, 0.55, 0.82]], alpha: [0.6, 0.55, 0]},
  {radius: 5900, drift: 0.38, seed: 29, tint: [[0.94, 0.97, 1.0], [1.0, 0.72, 0.62], [0.45, 0.5, 0.78]], alpha: [0.5, 0.45, 0]},
  {radius: 5850, drift: 0.6, seed: 47, tint: [[0.9, 0.94, 1.0], [0.8, 0.55, 0.72], [0.4, 0.45, 0.72]], alpha: [0.4, 0.4, 0]}
]
// Star sprites: [count, size range (deg of visible dot), peak alpha, colour, twinkle speed (0 = steady)]
const STAR_BUCKETS: {count: number; size: number[]; alpha: number; col: RGB; twinkle: number}[] = [
  {count: 108, size: [0.04, 0.08], alpha: 0.6, col: [0.82, 0.9, 1.0], twinkle: 0},
  {count: 104, size: [0.04, 0.09], alpha: 0.6, col: [1.0, 0.92, 0.78], twinkle: 0},
  {count: 12, size: [0.09, 0.16], alpha: 0.9, col: [0.85, 0.92, 1.0], twinkle: 0},
  {count: 11, size: [0.09, 0.16], alpha: 0.9, col: [1.0, 0.94, 0.82], twinkle: 0},
  {count: 8, size: [0.13, 0.2], alpha: 1, col: [1.0, 0.95, 0.85], twinkle: 0.9},
  {count: 7, size: [0.13, 0.2], alpha: 1, col: [0.88, 0.93, 1.0], twinkle: 0.7}
]
const STAR_DIST = 5500
const CLOUD_W = 256
const CLOUD_H = 64
const CLOUD_EL0 = 0 // clouds (the only blended layer besides stars / sun / moon) stay above the horizon
const CLOUD_EL1 = 50

@component
export class SkyHangarPreviewBackdrop extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SkyHangarPreviewBackdrop – procedural sky</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("The main camera SceneObject (the sky follows its position, never its rotation)")
  cameraObject!: SceneObject
  @input
  @hint("Unlit material with a base texture slot (SH_SkyTex); cloned per sky layer")
  skyMaterial!: Material
  @ui.group_end
  @ui.separator
  @ui.group_start("Time of Day")
  @input
  @hint("0 = day, 0.5 = dusk, 1 = night")
  @widget(new SliderWidget(0, 1, 0.01))
  timeOfDay: number = 0.5
  @input
  @hint("Animate Time of Day from 0 (day) to 1 (night) once, starting when the Lens starts")
  autoSunset: boolean = false
  @input
  @hint("Seconds the sunset takes from day to night")
  sunsetDurationSec: number = 30
  @ui.group_end

  private root!: SceneObject
  private skyTex!: Texture
  private skyW = 32
  private skyH = 1024
  private skyData!: Float32Array
  private skyNoise!: Float32Array
  private sunGlowMat!: Material
  private sunCoreMat!: Material
  private sunGlowObj!: SceneObject
  private sunCoreObj!: SceneObject
  private pendingClouds: {tex: Texture; seed: number}[] = []
  private cloudMats: Material[] = []
  private cloudObjs: SceneObject[] = []
  private starMats: Material[] = []
  private starFade = 0
  private moonMat!: Material
  private moonObj!: SceneObject
  private applied = -1
  private built = false
  private oldHidden = false
  private frame = 0
  private rng = 1234567

  onAwake(): void {
    if (!global.deviceInfoSystem.isEditor()) {
      this.sceneObject.enabled = false
      return
    }
    if (!this.skyMaterial) {
      print("SkyHangarPreviewBackdrop: skyMaterial not wired")
      return
    }
    this.build()
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  /** 0 = day, 0.5 = dusk, 1 = night. */
  setTimeOfDay(t: number): void {
    this.timeOfDay = Math.max(0, Math.min(1, t))
    if (this.built) this.apply(this.timeOfDay)
  }

  private build(): void {
    this.root = makeObj(this.sceneObject, "ProceduralSky")

    // Dome
    this.skyData = new Float32Array(this.skyW * this.skyH * 4)
    this.skyNoise = new Float32Array(this.skyW * this.skyH * 4)
    for (let k = 0; k < this.skyNoise.length; k++) this.skyNoise[k] = this.rand() - this.rand()
    this.skyTex = ProceduralTextureProvider.createWithFormat(this.skyW, this.skyH, TextureFormat.RGBA32Float)
    const domeMat = this.layerMaterial(this.skyTex, false)
    this.layer("SkyDome", sphereMesh(-90, 90, 48, 64), R, domeMat, ORDER)

    // Stars
    // ~250 individual star sprites (camera-facing quads on a big sphere), one mesh per brightness/colour bucket
    const dotTex = makeStarDot()
    for (const B of STAR_BUCKETS) {
      const dirs: vec3[] = [], sizes: number[] = []
      const sinMin = Math.sin(3 * DEG)
      for (let n = 0; n < B.count; n++) {
        const az = this.rand() * Math.PI * 2
        const el = Math.asin(sinMin + (1 - sinMin) * Math.pow(this.rand(), 0.6))
        dirs.push(dirOf(az, el))
        sizes.push(B.size[0] + (B.size[1] - B.size[0]) * Math.pow(this.rand(), 2))
      }
      const m = this.layerMaterial(dotTex, true)
      this.starMats.push(m)
      const o = makeObj(this.root, "Stars")
      this.attach(o, starQuads(dirs, sizes), m, ORDER + 1)
    }

    // Sun glow (wide, soft) and core (tight glow + disc)
    this.sunGlowMat = this.layerMaterial(makeSunTexture(true), true)
    this.sunGlowObj = makeObj(this.root, "SunGlow")
    this.sunGlowObj.getTransform().setLocalScale(new vec3(SUN_DIST * 2.4, SUN_DIST * 2.4, 1))
    this.attach(this.sunGlowObj, quadMesh(), this.sunGlowMat, ORDER + 1)
    this.sunCoreMat = this.layerMaterial(makeSunTexture(false), true)
    this.sunCoreObj = makeObj(this.root, "SunCore")
    this.sunCoreObj.getTransform().setLocalScale(new vec3(SUN_DIST * 0.42, SUN_DIST * 0.42, 1))
    this.attach(this.sunCoreObj, quadMesh(), this.sunCoreMat, ORDER + 2)

    // Moon
    this.moonMat = this.layerMaterial(this.makeMoon(), true)
    this.moonObj = makeObj(this.root, "Moon")
    const moonDir = dirOf(-30 * DEG, 52 * DEG)
    const moonTr = this.moonObj.getTransform()
    moonTr.setLocalPosition(moonDir.uniformScale(5400))
    moonTr.setLocalRotation(quat.lookAt(moonDir.uniformScale(-1), vec3.up()))
    moonTr.setLocalScale(new vec3(480, 480, 1))
    this.attach(this.moonObj, quadMesh(), this.moonMat, ORDER + 2)

    // Clouds
    const cloudMesh = sphereMesh(CLOUD_EL0, CLOUD_EL1, 24, 64)
    CLOUD_LAYERS.forEach((L, i) => {
      const tex = ProceduralTextureProvider.createWithFormat(CLOUD_W, CLOUD_H, TextureFormat.RGBA8Unorm)
      this.pendingClouds.push({tex, seed: L.seed})
      const mat = this.layerMaterial(tex, true)
      this.cloudMats.push(mat)
      this.cloudObjs.push(this.layer("Clouds_" + i, cloudMesh, L.radius, mat, ORDER + 3 + i))
    })

    this.built = true
    this.apply(this.timeOfDay)
  }

  private layerMaterial(tex: Texture, blended: boolean): Material {
    const m = this.skyMaterial.clone()
    const p = m.mainPass as any
    p.baseTex = tex
    p.baseColor = new vec4(1, 1, 1, 1)
    p.blendMode = blended ? BlendMode.Normal : BlendMode.Disabled
    p.twoSided = true
    // the dome is a fully opaque sphere with depth write and depth test on; only the star / cloud / sun / moon layers blend, above the horizon
    p.depthWrite = !blended
    p.depthTest = !blended
    return m
  }

  private layer(name: string, mesh: RenderMesh, radius: number, mat: Material, order: number): SceneObject {
    const o = makeObj(this.root, name)
    o.getTransform().setLocalScale(new vec3(radius, radius, radius))
    this.attach(o, mesh, mat, order)
    return o
  }

  private attach(o: SceneObject, mesh: RenderMesh, mat: Material, order: number): void {
    const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = mesh
    rmv.mainMaterial = mat
    rmv.setRenderOrder(order)
  }

  private rand(): number {
    this.rng = (this.rng * 1664525 + 1013904223) >>> 0
    return this.rng / 4294967296
  }

  private lastTick = -1

  /** Everything here is slow (the sky is at infinity), so it runs at most 10 times a second: head follow, Time of Day, cloud drift, star twinkle. */
  private update(): void {
    const t = getTime()
    if (t - this.lastTick < 0.1) return
    this.lastTick = t
    if (this.cameraObject) this.root.getTransform().setWorldPosition(this.cameraObject.getTransform().getWorldPosition())
    if (this.autoSunset) {
      // runs once from the start of the Lens; the slider value follows so the inspector shows progress
      this.timeOfDay = Math.min(1, t / Math.max(0.1, this.sunsetDurationSec))
    }
    if (Math.abs(this.timeOfDay - this.applied) > 0.0005) this.apply(this.timeOfDay)
    for (let i = 0; i < this.cloudObjs.length; i++) {
      this.cloudObjs[i].getTransform().setLocalRotation(quat.angleAxis(t * CLOUD_LAYERS[i].drift * DEG, vec3.up()))
    }
    if (this.starFade > 0.01) this.updateStars(t)
    const next = this.pendingClouds.pop()
    if (next) this.fillClouds(next.tex, next.seed)
  }

  private apply(t: number): void {
    this.applied = t
    const w = timeWeights(t)

    // Sun
    const sunEl = (SUN_ELEVATION[0] * w[0] + SUN_ELEVATION[1] * w[1] + SUN_ELEVATION[2] * w[2]) * DEG
    const sun = dirOf(SUN_AZIMUTH, sunEl)
    const sunCol = mix3(SUN_COLORS, w)
    const horizonFade = smoothstep(-12 * DEG, 2 * DEG, sunEl)
    const wideAmt = (SUN_WIDE[0] * w[0] + SUN_WIDE[1] * w[1]) * horizonFade
    const coreAmt = (SUN_CORE[0] * w[0] + SUN_CORE[1] * w[1]) * horizonFade
    const discAmt = horizonFade

    // Elevation gradient table
    // Gradient strip: one colour per row in a float texture, with a fixed +-1 LSB dither added so no 8-bit step shows as a band.
    const W = this.skyW, H = this.skyH
    const d = this.skyData
    const nz = this.skyNoise
    let i = 0
    for (let y = 0; y < H; y++) {
      const el = ((y + 0.5) / H) * 180 - 90
      // below the horizon the horizon colour eases (smoothly, no line) into the ground colour, which then continues to the nadir
      const sel = Math.max(el, 0)
      const c0 = stopColor(DAY_STOPS, sel), c1 = stopColor(DUSK_STOPS, sel), c2 = nightStop(sel)
      const gk = 1 - smoothstep(-GROUND_BLEND_DEG, 0, el)
      const gc = minLuminance(mix3(GROUND_COLORS, w), luminanceFloor(w)) // the ground never goes below the time-of-day luminance floor
      const fk = smoothstep(EDITOR_EDGE_DEG + STEP_BAND_DEG, EDITOR_EDGE_DEG - STEP_BAND_DEG, el) // 1 below the editor floor edge, 0 above, eased over a degree
      const cm = [0, 1, 2].map(k => (c0[k] * w[0] + c1[k] * w[1] + c2[k] * w[2]) * (1 - gk) + gc[k] * gk)
      // Colours brighter than STEP_MAX_C cannot be matched below the step, so the sky eases toward that cap as it nears the step (full colour again
      // 10 degrees above it) and the ground stays under it; then the compensation brightens everything below the step by the measured inverse.
      const cap = STEP_MAX_C + (1 - STEP_MAX_C) * smoothstep(EDITOR_EDGE_DEG + 1, EDITOR_EDGE_DEG + 10, el)
      // a touch of extra compensation in a thin line just under the edge: the preview darkens its very first pixels there a little more
      const bump = 1 + 0.12 * Math.exp(-Math.pow((el - (EDITOR_EDGE_DEG - 0.1)) / 0.12, 2))
      const c = horizonStepCompensate(minLuminance(cm.map(x => Math.min(x, cap)), largeSurfaceFloor(w)), fk * bump) // whole sky keeps the 0.65 / 0.55 / 0.45 floor, hue kept
      const lin = c
      const slope = [1 / 255, 1 / 255, 1 / 255]
      for (let x = 0; x < W; x++) {
        d[i] = Math.max(0, lin[0] + slope[0] * nz[i]); d[i + 1] = Math.max(0, lin[1] + slope[1] * nz[i + 1]); d[i + 2] = Math.max(0, lin[2] + slope[2] * nz[i + 2]); d[i + 3] = 1
        i += 4
      }
    }
    ;(this.skyTex.control as ProceduralTextureProvider).setPixelsFloat32(0, 0, W, H, d)

    // Sun: soft glow quad + bright core quad, steered to the sun direction and tinted
    const sunPos = sun.uniformScale(SUN_DIST)
    const sunRot = quat.lookAt(sun.uniformScale(-1), vec3.up())
    for (const o of [this.sunGlowObj, this.sunCoreObj]) {
      o.getTransform().setLocalPosition(sunPos)
      o.getTransform().setLocalRotation(sunRot)
      o.enabled = wideAmt > 0.01
    }
    ;(this.sunGlowMat.mainPass as any).baseColor = new vec4(sunCol[0], sunCol[1], sunCol[2], Math.min(1, wideAmt * 0.8))
    ;(this.sunCoreMat.mainPass as any).baseColor = new vec4(Math.min(1, sunCol[0] + 0.25), Math.min(1, sunCol[1] + 0.25), Math.min(1, sunCol[2] + 0.25), Math.min(1, coreAmt * 0.9 + discAmt * 0.1))

    // Stars + moon fade in with night
    const night = smoothstep(0.58, 0.92, t)
    this.starFade = smoothstep(0.6, 0.9, t)
    this.updateStars(getTime())
    ;(this.moonMat.mainPass as any).baseColor = new vec4(1, 1, 1, smoothstep(0.62, 0.95, t))
    this.moonObj.enabled = night > 0.01

    // Cloud tints catch the current sky colours
    CLOUD_LAYERS.forEach((L, k) => {
      const c = mix3(L.tint, w)
      const a = L.alpha[0] * w[0] + L.alpha[1] * w[1] + L.alpha[2] * w[2]
      ;(this.cloudMats[k].mainPass as any).baseColor = new vec4(c[0], c[1], c[2], a)
      this.cloudObjs[k].enabled = a > 0.01
    })
  }

  /** Soft cloud density in alpha, white-grey shading in rgb; tinted per time of day by the material colour. */
  private fillClouds(tex: Texture, seed: number): void {
    const W = CLOUD_W, H = CLOUD_H
    const data = new Uint8Array(W * H * 4)
    let i = 0
    for (let y = 0; y < H; y++) {
      const el = CLOUD_EL0 + ((y + 0.5) / H) * (CLOUD_EL1 - CLOUD_EL0)
      const ce = Math.cos(el * DEG), se = Math.sin(el * DEG)
      const window = smoothstep(0.5, 6, el) * (1 - smoothstep(28, 50, el))
      for (let x = 0; x < W; x++) {
        const a = ((x + 0.5) / W) * Math.PI * 2
        const px = Math.sin(a) * ce, pz = -Math.cos(a) * ce
        const f = noise3(px * 2.6, se * 6.5, pz * 2.6, seed) * 0.65 + noise3(px * 5.4, se * 13, pz * 5.4, seed + 1) * 0.35
        const cover = noise3(px * 0.9, se * 1.5, pz * 0.9, seed + 5)
        const dens = smoothstep(0.62 - cover * 0.25, 0.8 - cover * 0.15, f) * window
        const shade = 0.88 + 0.12 * f
        const v = Math.round(255 * shade * (1 - 0.25 * dens * (1 - f)))
        data[i++] = v; data[i++] = v; data[i++] = v
        data[i++] = Math.round(255 * dens * 0.9)
      }
    }
    ;(tex.control as ProceduralTextureProvider).setPixels(0, 0, W, H, data)
  }

  /** Each bucket fades in with night; the two brightest groups breathe slowly (+-6%). */
  private updateStars(time: number): void {
    for (let g = 0; g < this.starMats.length; g++) {
      const B = STAR_BUCKETS[g]
      const k = B.twinkle > 0 ? 0.94 + 0.06 * Math.sin(time * B.twinkle + g * 2.1) : 1
      ;(this.starMats[g].mainPass as any).baseColor = new vec4(B.col[0], B.col[1], B.col[2], this.starFade * B.alpha * k)
    }
  }

  /** Warm off-white moon: soft warm halo, a few darker maria patches, slight limb darkening. */
  private makeMoon(): Texture {
    const N = 128
    const tex = ProceduralTextureProvider.createWithFormat(N, N, TextureFormat.RGBA8Unorm)
    const data = new Uint8Array(N * N * 4)
    let i = 0
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const u = ((x + 0.5) / N - 0.5) * 2, v = ((y + 0.5) / N - 0.5) * 2
        const r = Math.sqrt(u * u + v * v)
        const disc = 1 - smoothstep(0.31, 0.34, r)
        const halo = Math.exp(-Math.pow(Math.max(0, r - 0.3) / 0.26, 2)) * 0.38 * (1 - smoothstep(0.7, 1, r))
        const patch = smoothstep(0.5, 0.68, noise3(u * 4.5 + 2, v * 4.5, 1.7, 3))
        const fine = noise3(u * 14, v * 14, 4.2, 7)
        const limb = 1 - 0.14 * Math.pow(Math.min(1, r / 0.34), 3)
        const shade = (1 - 0.2 * patch - 0.06 * fine) * limb
        const body: RGB = [1.0 * shade, 0.95 * shade, 0.82 * shade]
        const haloCol: RGB = [1.0, 0.9, 0.72]
        data[i++] = Math.round(255 * (haloCol[0] + (body[0] - haloCol[0]) * disc))
        data[i++] = Math.round(255 * (haloCol[1] + (body[1] - haloCol[1]) * disc))
        data[i++] = Math.round(255 * (haloCol[2] + (body[2] - haloCol[2]) * disc))
        data[i++] = Math.round(255 * Math.min(1, disc + halo * (1 - disc)))
      }
    }
    ;(tex.control as ProceduralTextureProvider).setPixels(0, 0, N, N, data)
    return tex
  }
}

/** Radial sun texture seen on a flat quad at SUN_DIST: glow = wide soft halo (half-width 50 deg), else tight glow + disc (half-width 12 deg). */
function makeSunTexture(glow: boolean): Texture {
  const N = glow ? 64 : 96
  const tex = ProceduralTextureProvider.createWithFormat(N, N, TextureFormat.RGBA8Unorm)
  const data = new Uint8Array(N * N * 4)
  const halfTan = glow ? 1.2 : 0.21
  let i = 0
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = ((x + 0.5) / N - 0.5) * 2, v = ((y + 0.5) / N - 0.5) * 2
      const rr = Math.sqrt(u * u + v * v)
      const ang = Math.atan(rr * halfTan)
      const edge = 1 - smoothstep(0.6, 1, rr)
      let a: number
      if (glow) a = (Math.exp(-(ang * ang) / (2 * 0.4 * 0.4)) * 0.8 + Math.exp(-(ang * ang) / (2 * 0.16 * 0.16)) * 0.2) * edge
      else a = Math.min(1, Math.exp(-(ang * ang) / (2 * 0.07 * 0.07)) * 0.85 + (1 - smoothstep(0.022, 0.03, ang))) * edge
      data[i++] = 255; data[i++] = 255; data[i++] = 255
      data[i++] = Math.round(255 * Math.max(0, Math.min(1, a)))
    }
  }
  ;(tex.control as ProceduralTextureProvider).setPixels(0, 0, N, N, data)
  return tex
}

/** Round star dot: sharp bright core, small soft glow, zero at the edge. */
function makeStarDot(): Texture {
  const N = 128
  const tex = ProceduralTextureProvider.createWithFormat(N, N, TextureFormat.RGBA8Unorm)
  const data = new Uint8Array(N * N * 4)
  let i = 0
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = ((x + 0.5) / N - 0.5) * 2, v = ((y + 0.5) / N - 0.5) * 2
      const r = Math.sqrt(u * u + v * v)
      const a = (Math.exp(-Math.pow(r / 0.16, 2)) + 0.3 * Math.exp(-Math.pow(r / 0.42, 2))) * (1 - smoothstep(0.7, 1, r))
      data[i++] = 255; data[i++] = 255; data[i++] = 255
      data[i++] = Math.round(255 * Math.min(1, a))
    }
  }
  ;(tex.control as ProceduralTextureProvider).setPixels(0, 0, N, N, data)
  return tex
}

/** One mesh of camera-facing quads: each star is a small square at STAR_DIST facing the origin (the user). */
function starQuads(dirs: vec3[], sizesDeg: number[]): RenderMesh {
  const b = new MeshBuilder([
    {name: "position", components: 3},
    {name: "normal", components: 3, normalized: true},
    {name: "texture0", components: 2}
  ])
  b.topology = MeshTopology.Triangles
  b.indexType = MeshIndexType.UInt16
  const verts: number[] = []
  const idx: number[] = []
  dirs.forEach((d, n) => {
    const ref = Math.abs(d.y) > 0.95 ? vec3.right() : vec3.up()
    const right = ref.cross(d).normalize()
    const up = d.cross(right)
    // the bright core is ~13% of the quad width, so the quad is ~6x the stated dot size
    const half = (STAR_DIST * Math.tan(sizesDeg[n] * DEG * 6)) / 2
    const c = d.uniformScale(STAR_DIST)
    const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]
    for (const k of corners) {
      const p = c.add(right.uniformScale(k[0] * half)).add(up.uniformScale(k[1] * half))
      verts.push(p.x, p.y, p.z, -d.x, -d.y, -d.z, k[2], k[3])
    }
    const o = n * 4
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3)
  })
  b.appendVerticesInterleaved(verts)
  b.appendIndices(idx)
  b.updateMesh()
  return b.getMesh()
}

function findByName(parent: SceneObject | null, name: string): SceneObject | null {
  const n = parent ? parent.getChildrenCount() : global.scene.getRootObjectsCount()
  for (let i = 0; i < n; i++) {
    const c = parent ? parent.getChild(i) : global.scene.getRootObject(i)
    if (c.name === name) return c
    const deep = findByName(c, name)
    if (deep) return deep
  }
  return null
}

function dirOf(az: number, el: number): vec3 {
  return new vec3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
}

/** Weights for [day, dusk, night]: smoothly 0 -> 0.5 -> 1. */
function timeWeights(t: number): number[] {
  const c = Math.max(0, Math.min(1, t))
  if (c <= 0.5) {
    const k = smoothstep(0, 1, c / 0.5)
    return [1 - k, k, 0]
  }
  const k = smoothstep(0, 1, (c - 0.5) / 0.5)
  return [0, 1 - k, k]
}

function mix3(c: RGB[], w: number[]): RGB {
  return [c[0][0] * w[0] + c[1][0] * w[1] + c[2][0] * w[2], c[0][1] * w[0] + c[1][1] * w[1] + c[2][1] * w[2], c[0][2] * w[0] + c[1][2] * w[1] + c[2][2] * w[2]]
}

/** Night colour with extra saturation: the preview adds a grey floor under dark colours, this keeps them blue-violet. */
function nightStop(deg: number): RGB {
  const c = stopColor(NIGHT_STOPS, deg)
  const l = c[0] * 0.3 + c[1] * 0.4 + c[2] * 0.3
  const k = 2.2
  return [Math.max(0, l + (c[0] - l) * k), Math.max(0, l + (c[1] - l) * k), Math.min(1, Math.max(0, l + (c[2] - l) * k))]
}

function stopColor(stops: number[][], deg: number): RGB {
  if (deg <= stops[0][0]) return [stops[0][1], stops[0][2], stops[0][3]]
  for (let i = 1; i < stops.length; i++) {
    if (deg <= stops[i][0]) {
      const k = smoothstep(0, 1, (deg - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]))
      const a = stops[i - 1], b = stops[i]
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k]
    }
  }
  const l = stops[stops.length - 1]
  return [l[1], l[2], l[3]]
}

function to8(v: number, dither: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255 + dither)))
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1274126177) ^ Math.imul(seed + 1, 362437)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  const c = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz, seed)
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), ux), l(c(0, 1, 0), c(1, 1, 0), ux), uy),
    l(l(c(0, 0, 1), c(1, 0, 1), ux), l(c(0, 1, 1), c(1, 1, 1), ux), uy),
    uz
  )
}

function fbm(x: number, y: number, z: number, seed: number): number {
  let sum = 0, amp = 0.5, f = 1
  for (let o = 0; o < 4; o++) {
    sum += amp * noise3(x * f, y * f, z * f, seed + o)
    amp *= 0.5
    f *= 2.03
  }
  return sum / 0.9375
}

/** Inward-facing band of a unit sphere with equirectangular UVs (u = azimuth turn, v = 0..1 across the band). */
function sphereMesh(el0Deg: number, el1Deg: number, rows: number, segs: number): RenderMesh {
  const b = new MeshBuilder([
    {name: "position", components: 3},
    {name: "normal", components: 3, normalized: true},
    {name: "texture0", components: 2}
  ])
  b.topology = MeshTopology.Triangles
  b.indexType = MeshIndexType.UInt16
  const verts: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= rows; i++) {
    const e = (el0Deg + ((el1Deg - el0Deg) * i) / rows) * DEG
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2
      const x = Math.cos(e) * Math.sin(a), y = Math.sin(e), z = -Math.cos(e) * Math.cos(a)
      verts.push(x, y, z, -x, -y, -z, j / segs, i / rows)
    }
  }
  const rn = segs + 1
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * rn + j, bb = a + 1, c = a + rn, dd = c + 1
      idx.push(a, bb, c, bb, dd, c)
    }
  }
  b.appendVerticesInterleaved(verts)
  b.appendIndices(idx)
  b.updateMesh()
  return b.getMesh()
}

/** Unit quad in the XY plane, UV 0..1. */
function quadMesh(): RenderMesh {
  const b = new MeshBuilder([
    {name: "position", components: 3},
    {name: "normal", components: 3, normalized: true},
    {name: "texture0", components: 2}
  ])
  b.topology = MeshTopology.Triangles
  b.indexType = MeshIndexType.UInt16
  b.appendVerticesInterleaved([
    -0.5, -0.5, 0, 0, 0, 1, 0, 0,
    0.5, -0.5, 0, 0, 0, 1, 1, 0,
    0.5, 0.5, 0, 0, 0, 1, 1, 1,
    -0.5, 0.5, 0, 0, 0, 1, 0, 1
  ])
  b.appendIndices([0, 1, 2, 0, 2, 3])
  b.updateMesh()
  return b.getMesh()
}
