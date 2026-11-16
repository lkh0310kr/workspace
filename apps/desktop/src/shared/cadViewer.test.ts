import { describe, expect, it } from 'vitest'
import { CAD_VIEWER_EXTENSIONS, isCadViewerExtension } from './cadViewer'

describe('isCadViewerExtension', () => {
  it('keeps the public extension set and matches case-insensitive path suffixes', () => {
    expect(CAD_VIEWER_EXTENSIONS).toEqual(['.urdf', '.srdf', '.sdf', '.dxf'])
    expect(isCadViewerExtension('/models/robot.URDF')).toBe(true)
    expect(isCadViewerExtension('layout.dxf')).toBe(true)
  })

  it('does not include other model formats', () => {
    expect(isCadViewerExtension('part.step')).toBe(false)
    expect(isCadViewerExtension('README.md')).toBe(false)
  })
})
