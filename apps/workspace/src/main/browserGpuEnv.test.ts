import { describe, expect, it, afterEach } from 'vitest'
import { applyBrowserGpuSwitches, resolveGlBackend } from './browserGpuEnv'

describe('browserGpuEnv', () => {
  const saved = process.env.WORKSPACE_GL

  afterEach(() => {
    if (saved === undefined) delete process.env.WORKSPACE_GL
    else process.env.WORKSPACE_GL = saved
  })

  it('honors WORKSPACE_GL override', () => {
    process.env.WORKSPACE_GL = 'egl'
    expect(resolveGlBackend()).toBe('egl')
  })

  it('applies angle-gl switches', () => {
    process.env.WORKSPACE_GL = 'angle-gl'
    const switches: string[] = []
    applyBrowserGpuSwitches((name, value) => {
      switches.push(value === undefined ? name : `${name}=${value}`)
    })
    expect(switches).toContain('disable-gpu-sandbox')
    expect(switches).toContain('use-angle=gl')
    expect(switches).toContain('use-gl=angle')
  })

  it('applies d3d11 switches when requested', () => {
    process.env.WORKSPACE_GL = 'd3d11'
    const switches: string[] = []
    applyBrowserGpuSwitches((name, value) => {
      switches.push(value === undefined ? name : `${name}=${value}`)
    })
    expect(switches).toContain('use-angle=d3d11')
  })
})
