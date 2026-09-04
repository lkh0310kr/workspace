import { describe, expect, it } from 'vitest'
import {
  PANE_GROUP_UNFOCUSED_OPACITY,
  paneGroupHostClassNames,
  resolvePaneGroupTabSetId
} from './paneGroupFocus'

describe('paneGroupFocus', () => {
  it('resolves tabset id from flexlayout parent', () => {
    expect(resolvePaneGroupTabSetId({ getType: () => 'tabset', getId: () => 'ts-1' })).toBe('ts-1')
    expect(resolvePaneGroupTabSetId({ getType: () => 'row', getId: () => 'row-1' })).toBeUndefined()
    expect(resolvePaneGroupTabSetId(undefined)).toBeUndefined()
  })

  it('does not dim a lone pane group', () => {
    expect(paneGroupHostClassNames({ hasSplitGroups: false, isFocused: false })).toBe('pane-group-host')
    expect(paneGroupHostClassNames({ hasSplitGroups: false, isFocused: true })).toBe('pane-group-host')
  })

  it('dims unfocused splits and highlights the focused one', () => {
    expect(paneGroupHostClassNames({ hasSplitGroups: true, isFocused: false })).toBe(
      'pane-group-host pane-group-host-unfocused'
    )
    expect(paneGroupHostClassNames({ hasSplitGroups: true, isFocused: true })).toBe(
      'pane-group-host pane-group-host-focused'
    )
  })

  it('uses 0.78 unfocused opacity constant', () => {
    expect(PANE_GROUP_UNFOCUSED_OPACITY).toBe(0.78)
  })
})
