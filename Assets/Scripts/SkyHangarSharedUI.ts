// SkyHangarSharedUI.ts
// Owns: the ONE SkyHangar style system shared by every *UI.ts module — palette, type scale
// (sized by reading distance), spacing + corner-radius tokens, and composition helpers
// (FlexLayout columns/rows, FlexItem registration, role-based text, frosted "glass" panels).
// Glass: the display is additive (black = transparent), so real backdrop blur is impossible —
// panels fake glass with a pale cool translucent tint, a soft radial inner glow and a thin bright edge,
// built on UIKit's RoundedRectangle visual. Plain module, no component.
// Must not: hold state. Non-UI scripts may import only the plain tokens (STROKE, MARK, TEXT).

import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {FlexAlign, FlexAlignSelf, FlexDirection, FlexJustify} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"

// ── Palette (round 1 "Colors" + round 2 #9). Never pure black panels.
export const PALETTE = {
  text: new vec4(0.96, 0.97, 1.0, 1), // soft white
  textDim: new vec4(0.94, 0.96, 1.0, 1), // = TEXT.secondary (opaque: alpha would cost contrast on additive glass)
  textFaint: new vec4(0.88, 0.92, 1.0, 1), // = TEXT.tertiary
  accent: new vec4(0.38, 0.68, 1.0, 1), // calm accent blue: active + tappable
  accentSoft: new vec4(0.38, 0.68, 1.0, 0.45),
  glassTint: new vec4(0.62, 0.72, 0.85, 0.26), // pale cool frosted glass
  glassGlow: new vec4(0.85, 0.92, 1.0, 0.16), // inner glow toward the centre
  glassDeep: new vec4(0.32, 0.45, 0.66, 0.42), // "deeper" glass for the route diagram (reads on additive)
  glassEdge: new vec4(0.9, 0.95, 1.0, 0.85), // thin bright edge
  divider: new vec4(0.85, 0.92, 1.0, 0.35),
  frost: new vec4(0.78, 0.84, 0.92, 0.32), // pale frosted gray (inactive buttons)
  trail: new vec4(0.45, 1.0, 0.6, 1), // green plane trail
  helicopter: new vec4(1.0, 0.72, 0.28, 1), // amber
  satellite: new vec4(0.35, 0.9, 1.0, 1), // cyan
  plane: new vec4(0.95, 0.97, 1.0, 1),
  success: new vec4(0.45, 1.0, 0.6, 1),
}

// ── Text colour tokens. All small text uses these: opaque and near-white, so it keeps >= 4.5:1 against
// its panel. Panels that carry small text must be at least as deep as the "readable" glass (about
// (0.20,0.30,0.52) at 0.62 alpha over the dusk sky, ~7:1 for TEXT.primary); check any other panel with
// contrastRatio() before putting small text on it.
export const TEXT = {
  primary: new vec4(1.0, 1.0, 1.0, 1),
  secondary: new vec4(0.94, 0.96, 1.0, 1),
  tertiary: new vec4(0.88, 0.92, 1.0, 1),
  accent: new vec4(0.62, 0.82, 1.0, 1), // accent-blue text bright enough for small sizes
}
export const MIN_TEXT_CONTRAST = 4.5
/** Glass tint for panels that carry small text (menu labels, shelf plaques): deep enough for >= 4.5:1. */
export const GLASS_READABLE = new vec4(0.2, 0.3, 0.52, 0.62)
function srgbLin(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function luminance(c: vec4): number {
  return 0.2126 * srgbLin(c.x) + 0.7152 * srgbLin(c.y) + 0.0722 * srgbLin(c.z)
}
/** WCAG contrast ratio between a text colour and an (opaque) background colour. */
export function contrastRatio(fg: vec4, bg: vec4): number {
  const a = luminance(fg), b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

// ── Hairline marks (reticle brackets, edge chevrons, pad arrows). One stroke + size definition, expressed
// at a reference viewing distance and scaled linearly with distance so the mark looks the same everywhere.
export const STROKE = {
  refDistanceCm: 120,
  hairlineCm: 0.15, // 1.5 mm at 1.2 m
  opacity: 0.85,
  color: new vec4(0.96, 0.98, 1.0, 0.85), // soft white
  /** Stroke width in cm for a mark that sits distanceCm away. */
  at(distanceCm: number): number { return (this.hairlineCm * distanceCm) / this.refDistanceCm },
}
/** Sky trail: one thin continuous line (about 2.5 mm at 1.2 m), alpha fading smoothly away from the object. */
export const TRAIL = {
  widthMm: 2.5,
  peakBehind: 0.9,
  peakAhead: 0.8,
  gapFromGlyphCm: 5, // the line starts just outside the sky glyph
  levels: 32, // alpha steps (shared materials) along the gradient
}
export const MARK = {
  bracketDeg: 2.6, // corner-bracket box side (aim reticle), just larger than a 1.9 degree sky glyph
  bracketArmFrac: 0.26, // arm length as a fraction of the box side
  chevronDeg: 0.7, // edge-arrow chevron size
  /** Size in cm of something spanning `deg` degrees at distanceCm. */
  cm(deg: number, distanceCm: number): number { return 2 * distanceCm * Math.tan((deg * Math.PI) / 360) },
}

// ── Type scale — single source of truth. Sizes are Lens Text sizes at the 110 cm reference distance;
// em height (cm) = size / 43.886. Body 54 => ~1.34 cm at 1.2 m (rule: >= 1.3 cm); Title 88 => ~2.2 cm at 1.2 m.
// One font everywhere: Space Grotesk (SIL OFL), regular/medium/semibold weights on glass.
export const FONT_SIZE_SCALE = 1.0
export const FONT = requireAsset("../Fonts/Space Grotesk.ttf") as Font
/** Point a UIKit ElementContent at the project font (UIKit keeps the field private). */
export function applyFontToContent(ec: unknown): void {
  ;(ec as {_font: Font})._font = FONT
}
export type TextRole =
  | "Display" | "Title" | "Headline" | "Body" | "Label"
  | "Title1" | "Title2" | "HeadlineXL" | "Headline1" | "Headline2"
  | "Subheadline" | "Button" | "Callout" | "Caption"
export const TYPE_SCALE: Record<TextRole, {size: number; weight: number}> = {
  Display: {size: 104, weight: 600}, // big numerals (altitude, speed, airport codes)
  Title: {size: 88, weight: 600},
  Headline: {size: 66, weight: 600},
  Body: {size: 54, weight: 400},
  Label: {size: 46, weight: 500}, // small all-caps labels
  // Legacy role names mapped onto the same scale
  Title1: {size: 88, weight: 600}, Title2: {size: 80, weight: 600},
  HeadlineXL: {size: 76, weight: 600}, Headline1: {size: 70, weight: 600},
  Headline2: {size: 62, weight: 600}, Subheadline: {size: 58, weight: 500},
  Button: {size: 50, weight: 500}, Callout: {size: 54, weight: 600},
  Caption: {size: 48, weight: 400},
}
export function roleSize(role: TextRole, distanceCm: number = 110): number {
  return TYPE_SCALE[role].size * FONT_SIZE_SCALE * (distanceCm / 110)
}
/** Approximate rendered em height in cm for a role at a distance (for layout budgeting and tests). */
export function roleHeightCm(role: TextRole, distanceCm: number = 110): number {
  return roleSize(role, distanceCm) / 43.886
}
export function applyTextRole(t: Text, role: TextRole, distanceCm: number = 110): void {
  t.font = FONT
  t.size = roleSize(role, distanceCm)
  ;(t as Text & {weight?: number}).weight = TYPE_SCALE[role].weight
}

// ── Spacing + corner radius scale (cm at 110 cm; multiply by distance/110)
export const SPACE = {xs: 0.3, s: 0.6, m: 1.0, l: 1.6, xl: 2.4}
export const RADIUS = {s: 0.8, m: 1.6, l: 2.6, pill: 99}

export const LAYOUT_Z_LIFT = 0.02
export const BUTTON_LABEL_Z = 0.08

/** Smallest hit area (cm) of any tappable control: about 2 degrees at the ~1 m reading distance. */
export const MIN_HIT_CM = 3.5

/**
 * Forgiving controls: grows only the button's collider (never its drawn size) to at least minCm on each side,
 * and gives a visible hover highlight (a small lift of the whole button). Call after btn.size is final.
 */
export function enlargeHitArea(btn: Button, minCm: number = MIN_HIT_CM, hoverScale: number = 1.1): void {
  const s = btn.size
  btn.colliderFitElement = false
  btn.colliderSize = new vec3(Math.max(s.x, minCm), Math.max(s.y, minCm), Math.max(s.z, 1))
  btn.colliderCenter = vec3.zero()
  const t = btn.sceneObject.getTransform()
  btn.onHoverEnter.add(() => t.setLocalScale(new vec3(hoverScale, hoverScale, 1)))
  btn.onHoverExit.add(() => t.setLocalScale(vec3.one()))
}

export function obj(parent: SceneObject, name: string, position?: vec3): SceneObject {
  const so = global.scene.createSceneObject(name)
  so.setParent(parent)
  if (position) so.getTransform().setLocalPosition(position)
  return so
}

/**
 * A frosted glass panel (UIKit RoundedRectangle): pale translucent tint + radial inner glow + thin bright edge.
 * Put content on a child lifted +0.6 cm in Z. Resize later via `rect.size = new vec2(w, h)`.
 */
export function glassPanel(
  parent: SceneObject,
  name: string,
  size: vec2,
  opts?: {tint?: vec4; glow?: vec4; edge?: vec4; edgeCm?: number; radiusCm?: number}
): {so: SceneObject; rect: RoundedRectangle} {
  const so = obj(parent, name)
  const rect = so.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
  styleGlass(rect, size, opts)
  return {so, rect}
}

export function styleGlass(rect: RoundedRectangle, size: vec2, opts?: {tint?: vec4; glow?: vec4; edge?: vec4; edgeCm?: number; radiusCm?: number}): void {
  rect.initialize() // idempotent; gradient/border setters write uniforms, so the visual must exist first
  const tint = opts?.tint ?? PALETTE.glassTint
  const glow = opts?.glow ?? PALETTE.glassGlow
  rect.size = size
  rect.cornerRadius = Math.min(opts?.radiusCm ?? RADIUS.m, Math.min(size.x, size.y) / 2)
  rect.gradient = true
  rect.setBackgroundGradient({
    enabled: true,
    type: "Radial",
    start: new vec2(0, 0.35),
    end: new vec2(1.1, -1.1),
    stop0: {enabled: true, color: new vec4(Math.min(1, tint.x + glow.x * glow.w), Math.min(1, tint.y + glow.y * glow.w), Math.min(1, tint.z + glow.z * glow.w), tint.w + glow.w * 0.5), percent: 0},
    stop1: {enabled: true, color: tint, percent: 1}
  })
  rect.border = true
  rect.borderSize = opts?.edgeCm ?? 0.12
  rect.borderColor = opts?.edge ?? PALETTE.glassEdge
}

/** A FlexLayout container (column or row) on its own SceneObject. */
export function makeFlex(
  parent: SceneObject,
  name: string,
  direction: FlexDirection,
  width: number,
  height: number,
  opts?: {gap?: number; padY?: number; padX?: number; justify?: FlexJustify; align?: FlexAlign}
): {so: SceneObject; flex: FlexLayout} {
  const so = obj(parent, name, new vec3(0, 0, LAYOUT_Z_LIFT))
  const flex = so.createComponent(FlexLayout.getTypeName()) as FlexLayout
  flex.autoDiscoverItemsOnStart = false // we register every child explicitly via addItems
  flex.width = width
  flex.height = height
  flex.direction = direction
  if (direction === FlexDirection.Row) flex.columnGap = opts?.gap ?? 0
  else flex.rowGap = opts?.gap ?? 0
  flex.paddingTop = opts?.padY ?? 0
  flex.paddingBottom = opts?.padY ?? 0
  flex.paddingLeft = opts?.padX ?? 0
  flex.paddingRight = opts?.padX ?? 0
  flex.justifyContent = opts?.justify ?? FlexJustify.Start
  flex.alignItems = opts?.align ?? FlexAlign.Stretch
  return {so, flex}
}

/**
 * A text row registered as a FlexItem of `parentFlex`. widthCM sizes the layout rect
 * for the longest expected string; heightCM is the row height the layout allocates.
 */
export function addTextRow(
  parent: SceneObject,
  parentFlex: FlexLayout,
  name: string,
  text: string,
  role: TextRole,
  widthCM: number,
  heightCM: number,
  color: vec4,
  distanceCm: number,
  align: HorizontalAlignment = HorizontalAlignment.Center
): Text {
  const so = obj(parent, name, new vec3(0, 0, LAYOUT_Z_LIFT))
  const t = so.createComponent("Component.Text") as Text
  t.text = text
  t.depthTest = true
  applyTextRole(t, role, distanceCm)
  t.textFill.color = color
  t.horizontalAlignment = align
  t.verticalAlignment = VerticalAlignment.Center
  t.horizontalOverflow = HorizontalOverflow.Shrink
  t.verticalOverflow = VerticalOverflow.Overflow
  t.layoutRect = Rect.create(-widthCM / 2, widthCM / 2, -heightCM / 2, heightCM / 2)
  const item = so.createComponent(FlexItem.getTypeName()) as FlexItem
  item.overrideWidth = widthCM
  item.overrideHeight = heightCM
  item.alignSelf = FlexAlignSelf.Center
  item.flexShrink = 0
  parentFlex.addItems([item])
  return t
}

/** Row height (cm) that comfortably fits a role at a distance. */
export function rowHeight(role: TextRole, distanceCm: number): number {
  return roleHeightCm(role, distanceCm) * 1.45
}

/** Registers an arbitrary child SceneObject as a fixed-size FlexItem. */
export function addFlexChild(child: SceneObject, parentFlex: FlexLayout, w: number, h: number): FlexItem {
  const item = child.createComponent(FlexItem.getTypeName()) as FlexItem
  item.overrideWidth = w
  item.overrideHeight = h
  item.flexShrink = 0
  parentFlex.addItems([item])
  return item
}

/** A thin horizontal divider line (glass edge colour) as a flex child. */
export function addDivider(parent: SceneObject, parentFlex: FlexLayout, name: string, width: number): void {
  // The shape lives on a CHILD of the flex item: a Shape on the item itself is resized by the layout
  // pass, which re-dirties the layout every frame.
  const so = obj(parent, name, new vec3(0, 0, LAYOUT_Z_LIFT))
  const line = obj(so, name + "Line")
  const r = line.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
  r.initialize()
  r.size = new vec2(width, 0.08)
  r.cornerRadius = 0.04
  r.backgroundColor = PALETTE.divider
  addFlexChild(so, parentFlex, width, 0.5)
}

export {FlexDirection, FlexJustify, FlexAlign}
