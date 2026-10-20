import {
  generateId,
  paddingFromShorthand,
  parseAutoLayoutDirection,
  parseCounterAxisAlign,
  parsePrimaryAxisAlign
} from '@open-pencil/scene-graph'
import type {
  Color,
  Effect,
  Fill,
  LayoutAlign,
  LayoutCounterAlign,
  LayoutMode,
  LayoutSizing,
  NodeType,
  SceneGraph,
  SceneNode,
  Stroke,
  StrokeCap,
  StrokeJoin,
  TextAlignVertical,
  Variable,
  VariableCollection,
  VariableCollectionMode,
  VariableType,
  VariableValue
} from '@open-pencil/scene-graph'
import { parseColor } from '@open-pencil/scene-graph/color'
import { BLACK } from '@open-pencil/scene-graph/constants'
import type { Vector } from '@open-pencil/scene-graph/primitives'

export interface PenDocument {
  version: string
  children: PenNode[]
  themes?: Record<string, string[]>
  variables?: Record<string, PenVariable>
}

export interface PenVariable {
  type: 'color' | 'string' | 'number'
  value: PenVariableValue[] | PenVariableValue | string | number
}

interface PenVariableValue {
  value: string | number
  theme?: Record<string, string>
}

interface LegacyPenStroke {
  align: 'inside' | 'center' | 'outside'
  thickness: number | { top?: number; right?: number; bottom?: number; left?: number }
  fill?: string
  join?: string
  cap?: string
}

interface PenEffect {
  type: string
  shadowType?: string
  color?: string
  offset?: Vector
  blur?: number
  spread?: number
}

interface PenFillObject {
  type: string
  color: string
  enabled?: boolean
}

type PenFillItem = string | PenFillObject
type PenFill = PenFillItem | PenFillItem[]
type PenStroke = PenFill | LegacyPenStroke
type PenStrokeWidth =
  | number
  | string
  | {
      top?: number | string
      right?: number | string
      bottom?: number | string
      left?: number | string
    }
type PenSpacingValue = number | string
type PenPadding =
  | PenSpacingValue
  | [PenSpacingValue, PenSpacingValue]
  | [PenSpacingValue, PenSpacingValue, PenSpacingValue, PenSpacingValue]

export interface PenNode {
  type: string
  id: string
  name?: string
  x?: number
  y?: number
  width?: number | string
  height?: number | string
  fill?: PenFill
  opacity?: number
  enabled?: boolean
  clip?: boolean
  rotation?: number
  flipX?: boolean
  flipY?: boolean
  reusable?: boolean
  cornerRadius?: number | string | (number | string)[]
  stroke?: PenStroke
  strokeWidth?: PenStrokeWidth
  strokeAlignment?: 'inner' | 'center' | 'outer'
  strokeLinecap?: 'butt' | 'round' | 'square'
  strokeLinejoin?: 'miter' | 'bevel' | 'round'
  effect?: PenEffect | PenEffect[]
  layout?: string
  gap?: number | string
  padding?: PenPadding
  justifyContent?: string
  alignItems?: string
  children?: PenNode[]
  content?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  lineHeight?: number
  letterSpacing?: number
  textAlign?: string
  textAlignVertical?: string
  textGrowth?: string
  ref?: string
  descendants?: Record<string, Partial<PenNode>>
  slot?: string[]
  geometry?: string
  iconFontName?: string
  iconFontFamily?: string
  weight?: number
  model?: string
  theme?: Record<string, string>
}

export interface VarContext {
  byName: Map<string, { id: string; variable: Variable }>
  activeModeId: string
  collectionId: string
  modeByThemeName: Map<string, string>
  resolveColor(ref: string): Color
  resolveNumber(ref: string): number
  resolveString(ref: string): string
  setActiveTheme(themeName: string): void
}

type PenStrokeStyle = Pick<
  PenNode,
  'strokeWidth' | 'strokeAlignment' | 'strokeLinecap' | 'strokeLinejoin'
>

function penVarTypeToSceneType(t: string): VariableType {
  if (t === 'color') return 'COLOR'
  if (t === 'number') return 'FLOAT'
  return 'STRING'
}

function penValueToSceneValue(raw: string | number, type: VariableType): VariableValue {
  if (type === 'COLOR' && typeof raw === 'string') return parseColor(raw)
  if (type === 'FLOAT' && typeof raw === 'number') return raw
  if (type === 'STRING') return String(raw)
  if (typeof raw === 'number') return raw
  return String(raw)
}

function defaultForType(type: VariableType): VariableValue {
  if (type === 'COLOR') return { ...BLACK }
  if (type === 'FLOAT') return 0
  if (type === 'BOOLEAN') return false
  return ''
}

export function isVarRef(val: unknown): val is string {
  return typeof val === 'string' && val.startsWith('$') && val.length > 1
}

function varName(ref: string): string {
  return ref.replace(/^\$/, '')
}

export function bindIfVar(node: SceneNode, field: string, val: unknown, ctx: VarContext): void {
  if (!isVarRef(val)) return
  const entry = ctx.byName.get(varName(val))
  if (entry) node.boundVariables[field] = entry.id
}

export function buildVarContext(
  graph: SceneGraph,
  penVars: Record<string, PenVariable>,
  themes: Record<string, string[]>
): VarContext {
  const collectionId = generateId()
  const modes: VariableCollectionMode[] = []
  const themeKeys = Object.keys(themes)

  if (themeKeys.length > 0) {
    const themeKey = themeKeys[0]
    for (const modeName of themes[themeKey]) {
      modes.push({ modeId: generateId(), name: modeName })
    }
  }
  if (modes.length === 0) {
    modes.push({ modeId: generateId(), name: 'Default' })
  }

  const collection: VariableCollection = {
    id: collectionId,
    name: 'Variables',
    modes,
    defaultModeId: modes[0].modeId,
    variableIds: []
  }
  graph.addCollection(collection)

  const modeByThemeValue = new Map<string, string>()
  if (themeKeys.length > 0) {
    const themeKey = themeKeys[0]
    for (const mode of modes) {
      modeByThemeValue.set(`${themeKey}:${mode.name}`, mode.modeId)
    }
  }

  const byName = new Map<string, { id: string; variable: Variable }>()

  for (const [name, def] of Object.entries(penVars)) {
    const varId = generateId()
    const varType = penVarTypeToSceneType(def.type)
    const valuesByMode: Record<string, VariableValue> = {}

    if (Array.isArray(def.value)) {
      for (const entry of def.value) {
        if (entry.theme) {
          const [tKey, tVal] = Object.entries(entry.theme)[0]
          const modeId = modeByThemeValue.get(`${tKey}:${tVal}`)
          if (modeId) valuesByMode[modeId] = penValueToSceneValue(entry.value, varType)
        } else {
          valuesByMode[modes[0].modeId] = penValueToSceneValue(entry.value, varType)
        }
      }
    } else {
      valuesByMode[modes[0].modeId] = penValueToSceneValue(def.value as string | number, varType)
    }

    for (const mode of modes) {
      if (!(mode.modeId in valuesByMode)) {
        valuesByMode[mode.modeId] = valuesByMode[modes[0].modeId] ?? defaultForType(varType)
      }
    }

    const variable: Variable = {
      id: varId,
      name,
      type: varType,
      collectionId,
      valuesByMode,
      description: '',
      hiddenFromPublishing: false
    }
    graph.addVariable(variable)
    byName.set(name, { id: varId, variable })
  }

  let activeModeId = modes[0].modeId

  function resolveVal(ref: string): VariableValue | undefined {
    const entry = byName.get(ref.replace(/^\$/, ''))
    if (!entry) return undefined
    return (
      entry.variable.valuesByMode[activeModeId] ?? Object.values(entry.variable.valuesByMode)[0]
    )
  }

  return {
    byName,
    activeModeId,
    collectionId,
    modeByThemeName: modeByThemeValue,
    resolveColor(ref: string): Color {
      const val = resolveVal(ref)
      if (val === undefined) return parseColor(ref)
      if (typeof val === 'object' && 'r' in val) return val
      if (typeof val === 'string') return parseColor(val)
      return { ...BLACK }
    },
    resolveNumber(ref: string): number {
      const val = resolveVal(ref)
      return typeof val === 'number' ? val : 0
    },
    resolveString(ref: string): string {
      const val = resolveVal(ref)
      return typeof val === 'string' ? val : ''
    },
    setActiveTheme(themeName: string) {
      const modeId = modeByThemeValue.get(`theme:${themeName}`)
      if (modeId) {
        activeModeId = modeId
        graph.activeMode.set(collectionId, modeId)
      }
    }
  }
}

function parseFillColor(fill: string | PenFillObject, ctx: VarContext): Color {
  const raw = typeof fill === 'string' ? fill : fill.color
  return isVarRef(raw) ? ctx.resolveColor(raw) : parseColor(raw)
}

export function convertFill(fill: PenFill | undefined, ctx: VarContext, node?: SceneNode): Fill[] {
  if (fill === undefined) return []
  const fills = Array.isArray(fill) ? fill : [fill]
  return fills.map((item, index) => {
    const visible = typeof item === 'string' ? true : item.enabled !== false
    const color = parseFillColor(item, ctx)
    const result: Fill = { type: 'SOLID', visible, opacity: color.a, color }
    if (node) bindIfVar(node, `fills[${index}]`, typeof item === 'string' ? item : item.color, ctx)
    return result
  })
}

function isLegacyPenStroke(stroke: PenStroke): stroke is LegacyPenStroke {
  return !Array.isArray(stroke) && typeof stroke === 'object' && 'thickness' in stroke
}

function strokeWidths(
  width: PenStrokeWidth | undefined,
  ctx: VarContext
): { weight: number; sides?: { top: number; right: number; bottom: number; left: number } } {
  if (width !== undefined && typeof width === 'object') {
    const sides = {
      top: parseSize(width.top, 0, ctx).value,
      right: parseSize(width.right, 0, ctx).value,
      bottom: parseSize(width.bottom, 0, ctx).value,
      left: parseSize(width.left, 0, ctx).value
    }
    return { weight: Math.max(sides.top, sides.right, sides.bottom, sides.left), sides }
  }
  return { weight: parseSize(width, 1, ctx).value }
}

function mapStrokeAlignment(align: string | undefined): Stroke['align'] {
  if (align === 'inner' || align === 'inside') return 'INSIDE'
  if (align === 'outer' || align === 'outside') return 'OUTSIDE'
  return 'CENTER'
}

function applyStrokeNodeStyle(
  node: SceneNode | undefined,
  sides: { top: number; right: number; bottom: number; left: number } | undefined,
  weight: number,
  align: Stroke['align'],
  cap: StrokeCap,
  join: StrokeJoin
): void {
  if (!node) return
  node.strokeWeight = weight
  node.strokeAlign = align
  if (sides) {
    node.independentStrokeWeights = true
    node.borderTopWeight = sides.top
    node.borderRightWeight = sides.right
    node.borderBottomWeight = sides.bottom
    node.borderLeftWeight = sides.left
  }
  node.strokeJoin = join
  node.strokeCap = cap
}

export function convertStroke(
  stroke: PenStroke | undefined,
  ctx: VarContext,
  node?: SceneNode,
  style: PenStrokeStyle = {}
): Stroke[] {
  if (stroke === undefined || stroke === '') return []

  if (isLegacyPenStroke(stroke)) {
    if (!stroke.fill) return []
    const color = isVarRef(stroke.fill) ? ctx.resolveColor(stroke.fill) : parseColor(stroke.fill)
    const { weight, sides } = strokeWidths(stroke.thickness, ctx)
    const align = mapStrokeAlignment(stroke.align)
    const cap = mapStrokeCap(stroke.cap)
    const join = mapStrokeJoin(stroke.join)
    const result: Stroke = {
      type: 'SOLID',
      visible: true,
      color,
      opacity: color.a,
      weight,
      align,
      cap,
      join,
      dashPattern: []
    }
    if (node) {
      bindIfVar(node, 'strokes[0]', stroke.fill, ctx)
      applyStrokeNodeStyle(node, sides, weight, align, cap, join)
    }
    return [result]
  }

  const paints = convertFill(stroke, ctx)
  const { weight, sides } = strokeWidths(style.strokeWidth, ctx)
  const align = mapStrokeAlignment(style.strokeAlignment)
  const cap = mapStrokeCap(style.strokeLinecap)
  const join = mapStrokeJoin(style.strokeLinejoin)
  const items = Array.isArray(stroke) ? stroke : [stroke]
  const result = paints.map((paint): Stroke => ({
    ...paint,
    weight,
    align,
    cap,
    join,
    dashPattern: []
  }))

  if (node) {
    items.forEach((item, index) => {
      bindIfVar(node, `strokes[${index}]`, typeof item === 'string' ? item : item.color, ctx)
    })
    applyStrokeNodeStyle(node, sides, weight, align, cap, join)
  }

  return result
}

function mapStrokeJoin(join: string | undefined): StrokeJoin {
  if (join === 'round') return 'ROUND'
  if (join === 'bevel') return 'BEVEL'
  return 'MITER'
}

function mapStrokeCap(cap: string | undefined): StrokeCap {
  if (cap === 'round') return 'ROUND'
  if (cap === 'square') return 'SQUARE'
  return 'NONE'
}

export function convertEffects(effect: PenEffect | PenEffect[] | undefined): Effect[] {
  if (!effect) return []
  const effects = Array.isArray(effect) ? effect : [effect]
  return effects.flatMap((item) => {
    if (item.type !== 'shadow') return []
    const color = item.color ? parseColor(item.color) : { r: 0, g: 0, b: 0, a: 0.25 }
    return [
      {
        type: item.shadowType === 'inner' ? 'INNER_SHADOW' : 'DROP_SHADOW',
        visible: true,
        blendMode: 'NORMAL',
        color,
        offset: item.offset ?? { x: 0, y: 0 },
        radius: item.blur ?? 0,
        spread: item.spread ?? 0
      } satisfies Effect
    ]
  })
}

export function applyCornerRadius(
  node: SceneNode,
  radius: PenNode['cornerRadius'],
  ctx: VarContext
): void {
  if (radius === undefined) return
  if (Array.isArray(radius)) {
    const values = radius.map((value) => parseSize(value, 0, ctx).value)
    node.independentCorners = true
    node.topLeftRadius = values[0] ?? 0
    node.topRightRadius = values[1] ?? 0
    node.bottomRightRadius = values[2] ?? 0
    node.bottomLeftRadius = values[3] ?? 0
    return
  }
  node.cornerRadius = parseSize(radius, 0, ctx).value
}

export function applyPadding(node: SceneNode, padding: PenNode['padding'], ctx?: VarContext): void {
  if (padding === undefined) return
  const resolve = (v: number | string): number =>
    typeof v === 'string' ? (isVarRef(v) && ctx ? ctx.resolveNumber(v) : Number(v) || 0) : v
  Object.assign(
    node,
    paddingFromShorthand(Array.isArray(padding) ? padding.map(resolve) : [resolve(padding)])
  )
}

interface ParsedSize {
  value: number
  sizing: LayoutSizing
  /** Fallback used only when fit_content(N) has no children. */
  fitContentFallback?: number
}

function parseParameterizedFallback(value: string, behavior: string): number | undefined {
  const prefix = `${behavior}(`
  if (!value.startsWith(prefix) || !value.endsWith(')')) return undefined

  const rawFallback = value.slice(prefix.length, -1).trim()
  if (rawFallback === '') return undefined

  const parsedFallback = Number(rawFallback)
  return Number.isFinite(parsedFallback) ? parsedFallback : undefined
}

function parseSizingBehavior(value: string, fallback: number): ParsedSize | undefined {
  if (value === 'fill_container') return { value: fallback, sizing: 'FILL' }
  if (value === 'fit_content') return { value: fallback, sizing: 'HUG' }

  // Older generated .pen files used hug_content as an alias for fit_content.
  if (value === 'hug_content') return { value: fallback, sizing: 'HUG' }

  const fillFallback = parseParameterizedFallback(value, 'fill_container')
  if (fillFallback !== undefined) return { value: fillFallback, sizing: 'FILL' }

  const fitFallback =
    parseParameterizedFallback(value, 'fit_content') ??
    parseParameterizedFallback(value, 'hug_content')
  if (fitFallback !== undefined) {
    return { value: fitFallback, sizing: 'HUG', fitContentFallback: fitFallback }
  }
  return undefined
}

export function parseSize(
  value: number | string | undefined,
  fallback: number,
  ctx?: VarContext
): ParsedSize {
  if (value === undefined) return { value: fallback, sizing: 'FIXED' }
  if (typeof value === 'number') return { value, sizing: 'FIXED' }

  const behavior = parseSizingBehavior(value, fallback)
  if (behavior) return behavior

  if (isVarRef(value) && ctx) return { value: ctx.resolveNumber(value), sizing: 'FIXED' }
  const parsed = Number(value)
  return { value: Number.isFinite(parsed) ? parsed : fallback, sizing: 'FIXED' }
}

export function mapLayoutMode(pen: PenNode): LayoutMode {
  const direction = parseAutoLayoutDirection(pen.layout)
  if (direction) return direction
  return pen.type === 'frame' && pen.layout === undefined ? 'HORIZONTAL' : 'NONE'
}

export function mapJustifyContent(value: string | undefined): LayoutAlign {
  return parsePrimaryAxisAlign(value) ?? 'MIN'
}

export function mapAlignItems(value: string | undefined): LayoutCounterAlign {
  return parseCounterAxisAlign(value) ?? 'MIN'
}

export function mapTextAlign(value: string | undefined): SceneNode['textAlignHorizontal'] {
  if (value === 'center') return 'CENTER'
  if (value === 'right' || value === 'end') return 'RIGHT'
  if (value === 'justified') return 'JUSTIFIED'
  return 'LEFT'
}

export function mapTextAlignVertical(value: string | undefined): TextAlignVertical {
  if (value === 'center') return 'CENTER'
  if (value === 'bottom' || value === 'end') return 'BOTTOM'
  return 'TOP'
}

export function mapFontWeight(value: string | number | undefined): number {
  if (typeof value === 'number') return value
  if (value === 'thin') return 100
  if (value === 'extralight') return 200
  if (value === 'light') return 300
  if (value === 'medium') return 500
  if (value === 'semibold') return 600
  if (value === 'bold') return 700
  if (value === 'extrabold') return 800
  if (value === 'black') return 900
  return 400
}

export function mapNodeType(pen: PenNode): NodeType {
  if (pen.type === 'frame') return pen.reusable ? 'COMPONENT' : 'FRAME'
  if (pen.type === 'rectangle') return 'RECTANGLE'
  if (pen.type === 'ellipse') return 'ELLIPSE'
  if (pen.type === 'text' || pen.type === 'icon_font') return 'TEXT'
  if (pen.type === 'path') return 'VECTOR'
  if (pen.type === 'ref') return 'INSTANCE'
  return 'FRAME'
}
