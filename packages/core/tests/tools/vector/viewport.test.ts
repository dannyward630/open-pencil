import { describe, expect, test } from 'bun:test'

import { FigmaAPI } from '@open-pencil/core/figma-api'
import { ALL_TOOLS } from '@open-pencil/core/tools'
import { SceneGraph } from '@open-pencil/scene-graph'

const viewportZoomToFit = ALL_TOOLS.find((tool) => tool.name === 'viewport_zoom_to_fit')
if (!viewportZoomToFit) throw new Error('viewport_zoom_to_fit tool missing')

describe('viewport_zoom_to_fit', () => {
  test('fits the union of valid nodes in the viewport', () => {
    const graph = new SceneGraph()
    const figma = new FigmaAPI(graph)
    const pageId = graph.getPages()[0].id
    const first = graph.createNode('RECTANGLE', pageId, {
      x: 100,
      y: 200,
      width: 4000,
      height: 2400
    })
    const second = graph.createNode('RECTANGLE', pageId, {
      x: 5000,
      y: 3000,
      width: 200,
      height: 200
    })

    expect(viewportZoomToFit.execute(figma, { ids: [first.id, second.id, 'missing'] })).toEqual({
      center: { x: 2650, y: 1700 },
      bounds: { x: 100, y: 200, width: 5100, height: 3000 }
    })
    expect(figma.viewport.center).toEqual({ x: 2650, y: 1700 })
    expect(figma.viewport.zoom).toBeLessThan(1)
  })

  test('returns an error when no requested nodes exist', () => {
    const figma = new FigmaAPI(new SceneGraph())

    expect(viewportZoomToFit.execute(figma, { ids: ['missing'] })).toEqual({
      error: 'No valid nodes found'
    })
    expect(figma.viewport.zoom).toBe(1)
  })
})
