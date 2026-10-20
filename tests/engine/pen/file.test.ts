import { describe, expect, test } from 'bun:test'

import { parsePenFile } from '@open-pencil/core'

import { repoPath } from '#tests/helpers/paths'

const BLUE = { r: 64 / 255, g: 148 / 255, b: 208 / 255, a: 1 }
const FIXTURE_DIR = repoPath('tests/fixtures')

async function loadFixture(name: string): Promise<string> {
  return Bun.file(`${FIXTURE_DIR}/${name}`).text()
}

describe('parsePenFile', () => {
  test('imports current-format strokes from a single fill or fill array', () => {
    const graph = parsePenFile(
      JSON.stringify({
        version: '2.21',
        variables: {
          border: { type: 'color', value: '#4094D0' },
          'border-width': { type: 'number', value: 3 }
        },
        children: [
          {
            id: 'single-stroke',
            type: 'rectangle',
            stroke: '#000000',
            strokeWidth: '$border-width',
            strokeAlignment: 'inner',
            strokeLinecap: 'round',
            strokeLinejoin: 'bevel'
          },
          {
            id: 'multiple-strokes',
            type: 'rectangle',
            stroke: ['#000000', { type: 'color', color: '$border', enabled: false }],
            strokeWidth: { top: 1, right: 2, bottom: 3, left: 4 },
            strokeAlignment: 'outer',
            strokeLinecap: 'square',
            strokeLinejoin: 'round'
          },
          {
            id: 'stroke-component',
            type: 'frame',
            reusable: true,
            stroke: '#FF0000',
            strokeWidth: 2
          },
          {
            id: 'stroke-instance',
            type: 'ref',
            ref: 'stroke-component',
            strokeWidth: 4
          }
        ]
      })
    )
    const single = graph.getNode('single-stroke')
    const multiple = graph.getNode('multiple-strokes')
    const instance = graph.getNode('stroke-instance')

    expect(single?.strokes).toHaveLength(1)
    expect(single?.strokes[0]).toMatchObject({
      type: 'SOLID',
      color: { r: 0, g: 0, b: 0, a: 1 },
      weight: 3,
      align: 'INSIDE',
      cap: 'ROUND',
      join: 'BEVEL'
    })
    expect(single?.strokeCap).toBe('ROUND')
    expect(single?.strokeJoin).toBe('BEVEL')

    expect(multiple?.strokes).toHaveLength(2)
    expect(multiple?.strokes).toMatchObject([
      { weight: 4, align: 'OUTSIDE', cap: 'SQUARE', join: 'ROUND' },
      { weight: 4, align: 'OUTSIDE', visible: false, cap: 'SQUARE', join: 'ROUND' }
    ])
    expect(multiple?.strokes[1]?.color).toEqual(BLUE)
    expect(multiple?.boundVariables['strokes[1]']).toBeDefined()
    expect(multiple?.independentStrokeWeights).toBe(true)
    expect(multiple).toMatchObject({
      borderTopWeight: 1,
      borderRightWeight: 2,
      borderBottomWeight: 3,
      borderLeftWeight: 4,
      strokeCap: 'SQUARE',
      strokeJoin: 'ROUND'
    })
    expect(instance?.strokes[0]).toMatchObject({
      color: { r: 1, g: 0, b: 0, a: 1 },
      weight: 4
    })
  })

  test('imports variables and theme modes', async () => {
    const graph = parsePenFile(await loadFixture('pencil_simple.pen'))
    const collections = [...graph.variableCollections.values()]

    expect(collections.length).toBe(1)
    expect(collections[0].modes.map((mode) => mode.name)).toEqual(['Light', 'Dark'])
    expect(graph.variables.size).toBeGreaterThan(0)
  })

  test('maps reusable frames to components', async () => {
    const graph = parsePenFile(await loadFixture('pencil_button.pen'))
    const components = [...graph.getAllNodes()].filter((node) => node.type === 'COMPONENT')

    expect(components.length).toBeGreaterThan(0)
    expect(components[0]?.name).toContain('Button')
  })

  test('maps path geometry to vector nodes', async () => {
    const graph = parsePenFile(await loadFixture('pencil_button.pen'))
    const vectors = [...graph.getAllNodes()].filter((node) => node.type === 'VECTOR')

    expect(vectors.length).toBeGreaterThan(0)
    expect(vectors.some((node) => (node.vectorNetwork?.vertices.length ?? 0) > 0)).toBe(true)
  })
})
