import { describe, expect, test } from 'bun:test'

import { SceneGraph } from '@open-pencil/scene-graph'

import { renderNodesToSVG } from '#core/io/formats/svg/index'

const solidFill = (value: number) => ({
  type: 'SOLID' as const,
  color: { r: value, g: value, b: value, a: 1 },
  opacity: 1,
  visible: true
})

describe('SVG export background blur', () => {
  test('reports visible backdrop blur instead of exporting it as layer blur', () => {
    const graph = new SceneGraph()
    const page = graph.addPage('Synthetic backdrop test')
    const frame = graph.createNode('FRAME', page.id, { width: 160, height: 96 })
    graph.createNode('RECTANGLE', frame.id, {
      width: 80,
      height: 96,
      fills: [solidFill(1)]
    })
    graph.createNode('RECTANGLE', frame.id, {
      x: 80,
      width: 80,
      height: 96,
      fills: [solidFill(0)]
    })
    graph.createNode('RECTANGLE', frame.id, {
      width: 160,
      height: 96,
      opacity: 0.4,
      fills: [solidFill(0)],
      effects: [
        {
          type: 'BACKGROUND_BLUR',
          radius: 12,
          visible: true,
          color: { r: 0, g: 0, b: 0, a: 0 },
          offset: { x: 0, y: 0 },
          spread: 0
        }
      ]
    })

    expect(() => renderNodesToSVG(graph, page.id, [frame.id], { colorSpace: 'srgb' })).toThrow(
      'SVG export cannot faithfully represent BACKGROUND_BLUR'
    )
  })

  test('warns and skips visible backdrop blur when requested', () => {
    const graph = new SceneGraph()
    const page = graph.addPage('Synthetic backdrop test')
    const node = graph.createNode('RECTANGLE', page.id, {
      width: 160,
      height: 96,
      fills: [solidFill(0)],
      effects: [
        {
          type: 'BACKGROUND_BLUR',
          radius: 12,
          visible: true,
          color: { r: 0, g: 0, b: 0, a: 0 },
          offset: { x: 0, y: 0 },
          spread: 0
        }
      ]
    })
    const warnings: Array<{ code: string; nodeId: string; effect: string }> = []

    const svg = renderNodesToSVG(graph, page.id, [node.id], {
      colorSpace: 'srgb',
      skipUnsupportedEffects: true,
      onWarning: (warning) => warnings.push(warning)
    })

    expect(svg).toContain('<svg')
    expect(svg).not.toContain('feGaussianBlur')
    expect(warnings).toEqual([
      expect.objectContaining({
        code: 'unsupported-effect',
        effect: 'BACKGROUND_BLUR',
        nodeId: node.id
      })
    ])
  })
})
