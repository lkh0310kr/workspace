import { describe, expect, it } from 'vitest'
import { findUnreferencedTerminalIds } from './terminalReferences'

function layout(...terminalIds: number[]): string {
  return JSON.stringify(terminalIds.map((terminalId) => ({ kind: 'terminal', terminalId })))
}

describe('findUnreferencedTerminalIds', () => {
  it('keeps a terminal alive while any workspace layout still references it', () => {
    expect(findUnreferencedTerminalIds([2, 1], [layout(1), layout(2, 3)])).toEqual([])
  })

  it('releases only terminal ids missing from every remaining layout', () => {
    expect(findUnreferencedTerminalIds([1, 2, 3], [layout(2)])).toEqual([1, 3])
  })

  it('deduplicates candidate ids without changing their order', () => {
    expect(findUnreferencedTerminalIds([4, 4, 2, 4], [])).toEqual([4, 2])
  })
})
