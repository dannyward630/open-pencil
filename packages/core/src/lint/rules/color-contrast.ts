import { colorToHex, contrastRatio } from '@open-pencil/scene-graph/color'
import { rotatedCorners } from '@open-pencil/scene-graph/geometry'

import { defineRule } from '#core/lint/rule'
import type { LintNode, RuleContext } from '#core/lint/types'

/** WCAG AA: 4.5:1 for text, 3:1 for large text, which is 24px, or 18.66px when bold. */
const MIN_CONTRAST = 4.5
const MIN_LARGE_CONTRAST = 3
const LARGE_TEXT_PX = 24
const LARGE_BOLD_TEXT_PX = 18.66
const BOLD_WEIGHT = 700

type Corners = ReturnType<typeof rotatedCorners>

interface SiblingOrder {
  indexById: Map<string, number>
  backgrounds: { index: number; corners: Corners }[]
}

/** Built once per parent for a lint run, rather than once for each text child. */
const siblingOrderCache = new WeakMap<RuleContext, WeakMap<LintNode, SiblingOrder>>()

function nodeCorners(node: LintNode): Corners {
  return rotatedCorners(
    node.x + node.width / 2,
    node.y + node.height / 2,
    node.width / 2,
    node.height / 2,
    node.rotation
  )
}

/** Separating-axis test for two rotated rectangles; edge contact is not an overlap. */
function overlapsRotatedRectangles(a: Corners, b: Corners): boolean {
  for (const corners of [a, b]) {
    for (let edge = 0; edge < 2; edge++) {
      const from = corners[edge]
      const to = corners[edge + 1]
      const axisX = from.y - to.y
      const axisY = to.x - from.x
      let aMin = Infinity
      let aMax = -Infinity
      let bMin = Infinity
      let bMax = -Infinity
      for (const point of a) {
        const projection = point.x * axisX + point.y * axisY
        aMin = Math.min(aMin, projection)
        aMax = Math.max(aMax, projection)
      }
      for (const point of b) {
        const projection = point.x * axisX + point.y * axisY
        bMin = Math.min(bMin, projection)
        bMax = Math.max(bMax, projection)
      }
      if (aMax <= bMin || bMax <= aMin) return false
    }
  }
  return true
}

function isPaintedSibling(node: LintNode): boolean {
  return (
    node.type !== 'TEXT' &&
    node.visible &&
    node.opacity !== 0 &&
    node.width > 0 &&
    node.height > 0 &&
    node.fills.some((fill) => fill.visible && fill.opacity > 0 && (fill.color?.a ?? 1) > 0)
  )
}

function siblingOrder(parent: LintNode, context: RuleContext): SiblingOrder {
  let parents = siblingOrderCache.get(context)
  if (!parents) {
    parents = new WeakMap()
    siblingOrderCache.set(context, parents)
  }
  const cached = parents.get(parent)
  if (cached) return cached

  const siblings = context.getChildren(parent)
  const indexById = new Map(siblings.map((sibling, index) => [sibling.id, index]))
  const backgrounds = siblings.flatMap((sibling, index) =>
    isPaintedSibling(sibling) ? [{ index, corners: nodeCorners(sibling) }] : []
  )
  const order = { indexById, backgrounds }
  parents.set(parent, order)
  return order
}

/** Whether an earlier painted sibling actually overlaps the text. */
function hasOverlappingSiblingFill(node: LintNode, context: RuleContext): boolean {
  const parent = context.getParent(node)
  if (!parent || node.width <= 0 || node.height <= 0) return false
  const order = siblingOrder(parent, context)
  const nodeIndex = order.indexById.get(node.id)
  if (nodeIndex === undefined || nodeIndex <= 0) return false

  const textCorners = nodeCorners(node)
  for (const background of order.backgrounds) {
    if (background.index >= nodeIndex) break
    if (overlapsRotatedRectangles(textCorners, background.corners)) return true
  }
  return false
}

function minContrast(style: { fontSize: number; fontWeight: number }): number {
  const large =
    style.fontSize >= LARGE_TEXT_PX ||
    (style.fontSize >= LARGE_BOLD_TEXT_PX && style.fontWeight >= BOLD_WEIGHT)
  return large ? MIN_LARGE_CONTRAST : MIN_CONTRAST
}

/** The strictest threshold any stretch of the text needs. */
function requiredContrast(node: {
  fontSize: number
  textStyles?: { fontSize: number; fontWeight: number }[]
}): number {
  const styles = node.textStyles ?? [{ fontSize: node.fontSize, fontWeight: 0 }]
  return Math.max(...styles.map(minContrast))
}

export default defineRule({
  meta: {
    id: 'color-contrast',
    category: 'accessibility',
    severity: 'error',
    description: 'Text must have sufficient contrast against its background'
  },
  match: ['TEXT'],
  check(node, context) {
    const textColor = node.fills.find((f) => f.type === 'SOLID' && f.visible && f.color)?.color
    if (textColor == null) return
    let parent = context.getParent(node)
    // A painted sibling may replace the ancestor fill under this text; avoid a guessed ratio.
    if (hasOverlappingSiblingFill(node, context)) return
    while (parent) {
      const background = parent.fills.find((f) => f.type === 'SOLID' && f.visible && f.color)?.color
      if (background) {
        const ratio = contrastRatio(textColor, background)
        const minRatio = requiredContrast(node)
        if (ratio < minRatio)
          context.report({
            node,
            message: `Contrast ratio ${ratio.toFixed(2)}:1 is below WCAG AA`,
            suggest: 'Increase contrast between text and background',
            data: {
              ratio: Math.floor(ratio * 100) / 100,
              minRatio,
              foreground: colorToHex({ ...textColor, a: 1 }),
              background: colorToHex({ ...background, a: 1 })
            }
          })
        return
      }
      parent = context.getParent(parent)
    }
  }
})
