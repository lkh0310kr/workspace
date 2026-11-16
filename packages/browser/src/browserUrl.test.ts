import { describe, it, expect } from 'vitest'
import { normalizeBrowserNavigationUrl } from './browserUrl'

describe('normalizeBrowserNavigationUrl', () => {
  it('passes through a normal https URL', () => {
    expect(normalizeBrowserNavigationUrl('https://example.com', false)).toBe('https://example.com/')
  })

  it('rejects an arbitrary unknown scheme', () => {
    expect(normalizeBrowserNavigationUrl('ftp://example.com', false)).toBeNull()
  })
})
