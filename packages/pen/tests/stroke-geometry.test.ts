import { describe, expect, test } from 'bun:test'

import { parsePenFile } from '@open-pencil/pen'

describe('Pen stroke geometry', () => {
  test('keeps node geometry aligned with imported strokes and defaults empty legacy widths', () => {
    const graph = parsePenFile(
      JSON.stringify({
        version: '2.21',
        children: [
          {
            id: 'current-stroke',
            type: 'rectangle',
            stroke: '#000000',
            strokeWidth: { top: 1, right: 2, bottom: 3, left: 4 },
            strokeAlignment: 'outer',
            effect: { type: 'shadow', spread: 6 }
          },
          {
            id: 'legacy-stroke',
            type: 'rectangle',
            stroke: {
              align: 'outside',
              thickness: { top: 1, right: 2, bottom: 3, left: 4 },
              fill: '#000000'
            }
          },
          {
            id: 'legacy-empty-width',
            type: 'rectangle',
            stroke: { align: 'inside', thickness: {}, fill: '#000000' }
          }
        ]
      })
    )
    const current = graph.getNode('current-stroke')
    const legacy = graph.getNode('legacy-stroke')
    const emptyLegacy = graph.getNode('legacy-empty-width')

    expect(current?.effects[0]?.spread).toBe(6)
    expect(current).toMatchObject({
      strokeWeight: 4,
      strokeAlign: 'OUTSIDE',
      independentStrokeWeights: true,
      borderTopWeight: 1,
      borderRightWeight: 2,
      borderBottomWeight: 3,
      borderLeftWeight: 4
    })
    expect(legacy).toMatchObject({
      strokeWeight: 4,
      strokeAlign: 'OUTSIDE',
      independentStrokeWeights: true,
      borderTopWeight: 1,
      borderRightWeight: 2,
      borderBottomWeight: 3,
      borderLeftWeight: 4
    })
    expect(emptyLegacy).toMatchObject({
      strokes: [{ weight: 0, align: 'INSIDE' }],
      strokeWeight: 0,
      strokeAlign: 'INSIDE',
      independentStrokeWeights: true,
      borderTopWeight: 0,
      borderRightWeight: 0,
      borderBottomWeight: 0,
      borderLeftWeight: 0
    })
  })
})
