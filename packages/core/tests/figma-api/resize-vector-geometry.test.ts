import { expect, test } from 'bun:test'

import { FigmaAPI } from '@open-pencil/core/figma-api'
import { createSVGNodes } from '@open-pencil/core/io/formats/svg'
import { SceneGraph } from '@open-pencil/scene-graph'

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg"><rect width="318" height="80" rx="12" fill="#558855"/></svg>'

const STROKED_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="314" height="76" fill="none" stroke="#000" stroke-width="4"/></svg>'

function importedVector(svg = SVG, graph = new SceneGraph()) {
  const root = createSVGNodes(graph, graph.getPages()[0].id, svg)
  if (!root) throw new Error('SVG import produced no nodes')
  const [node] = graph.getChildren(root.id)
  if (node?.type !== 'VECTOR') throw new Error('SVG rectangle did not import as a vector')
  const proxy = new FigmaAPI(graph).getNodeById(node.id)
  if (!proxy) throw new Error('Imported vector proxy was not found')
  return proxy
}

for (const method of ['resize', 'resizeWithoutConstraints'] as const) {
  test(`${method} scales an imported vector's geometry with its box`, () => {
    // Regression for #1438: the SVG path must follow the new Plugin API dimensions.
    const vector = importedVector()
    const originalNetwork = vector.vectorNetwork
    if (!originalNetwork) throw new Error('SVG rectangle has no vector network')

    vector[method](318, 64)

    const resizedNetwork = vector.vectorNetwork
    if (!resizedNetwork) throw new Error('Resized vector has no vector network')
    expect(vector.width).toBe(318)
    expect(vector.height).toBe(64)
    expect(resizedNetwork).not.toEqual(originalNetwork)
    expect(Math.max(...resizedNetwork.vertices.map(({ y }) => y))).toBeCloseTo(64)
    expect(resizedNetwork.vertices.map(({ y }) => y)).toEqual(
      originalNetwork.vertices.map(({ y }) => y * 0.8)
    )
  })
}

// Figma 126: a 4 px stroke on a vector resized to half its height is still 4 px.
test('resize keeps the stroke weight and draws the stroke from the scaled path', () => {
  const graph = new SceneGraph()
  const vector = importedVector(STROKED_SVG, graph)
  graph.updateNode(vector.id, {
    strokeGeometry: [{ windingRule: 'NONZERO', commandsBlob: new Uint8Array([0]) }]
  })

  vector.resize(vector.width, vector.height / 2)

  expect(vector.strokeWeight).toBe(4)
  expect(graph.getNode(vector.id)?.strokeGeometry).toEqual([])
})
