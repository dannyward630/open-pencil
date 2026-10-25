import { defineRule } from '#core/lint/rule'
import { nameWords } from '#core/lint/utils'

/** WCAG 2.2 target size, enhanced (AAA). `minSize: 24` checks the AA minimum instead. */
const DEFAULT_MIN_SIZE = 44
/** Words that name a control; a trailing plural `s` also matches ("Tabs", "Actions"). */
const CONTROL_WORDS = new Set([
  'button',
  'btn',
  'link',
  'cta',
  'checkbox',
  'radio',
  'switch',
  'toggle',
  'input',
  'select',
  'dropdown',
  'menu',
  'tab',
  'chip',
  'tag',
  'close',
  'dismiss',
  'action'
])

function isPluralControlWord(word: string): boolean {
  return word.endsWith('s') && CONTROL_WORDS.has(word.slice(0, -1))
}

function isInteractive(name: string): boolean {
  return nameWords(name).some((word) => CONTROL_WORDS.has(word) || isPluralControlWord(word))
}

function isPluralOnlyControlGroup(name: string, childCount: number): boolean {
  if (childCount < 2) return false
  const words = nameWords(name)
  return words.some(isPluralControlWord) && !words.some((word) => CONTROL_WORDS.has(word))
}

export default defineRule({
  meta: {
    id: 'touch-target-size',
    category: 'accessibility',
    description:
      'Interactive elements should be large enough to tap (44×44px, or 24×24px for WCAG AA)'
  },
  match: ['FRAME', 'COMPONENT', 'INSTANCE', 'RECTANGLE', 'ELLIPSE'],
  check(node, context) {
    const isControlGroup = isPluralOnlyControlGroup(node.name, node.childIds.length)
    if (!isInteractive(node.name) || isControlGroup) return
    const config = context.getConfig() as { minSize?: number } | undefined
    const minSize = config?.minSize ?? DEFAULT_MIN_SIZE
    if (node.width >= minSize && node.height >= minSize) return
    // A control nested in another control (the icon of a button) is not its own target.
    for (let parent = context.getParent(node); parent; parent = context.getParent(parent)) {
      if (
        isInteractive(parent.name) &&
        !isPluralOnlyControlGroup(parent.name, parent.childIds.length)
      ) {
        return
      }
    }
    context.report({
      node,
      message: `Touch target too small: ${node.width}×${node.height}px`,
      suggest: `Resize to at least ${minSize}×${minSize}px or add padding`,
      data: { width: node.width, height: node.height, minSize }
    })
  }
})
