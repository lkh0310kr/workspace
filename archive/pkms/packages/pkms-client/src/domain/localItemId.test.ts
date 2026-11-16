import { describe, expect, it } from 'vitest'
import { localItemIdForPath } from './localItemId'

describe('localItemIdForPath', () => {
  it('encodes ASCII paths as stable base64url IDs', () => {
    expect(localItemIdForPath('docs/readme.md')).toBe('local-ZG9jcy9yZWFkbWUubWQ')
    expect(localItemIdForPath('docs/readme.md')).toBe(localItemIdForPath('docs/readme.md'))
    expect(localItemIdForPath('docs/../readme.md')).not.toBe(localItemIdForPath('readme.md'))
  })

  it('encodes non-ASCII paths as UTF-8 before base64url conversion', () => {
    expect(localItemIdForPath('문서/안녕.md')).toBe('local-66y47IScL-yViOuFlS5tZA')
  })

  it('replaces base64 plus and slash characters and removes padding', () => {
    expect(localItemIdForPath('௿')).toBe('local-4K-_')
    expect(localItemIdForPath('??')).toBe('local-Pz8')
  })
})
