import { describe, expect, it } from 'vitest'
import { createTerminalEnvironment } from './terminalEnvironment'

describe('createTerminalEnvironment', () => {
  it('removes inherited color suppression and promotes a usable terminal type', () => {
    expect(createTerminalEnvironment({ NO_COLOR: '1', COLOR: '0', TERM: 'dumb' })).toMatchObject({
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    })
    expect(createTerminalEnvironment({ NO_COLOR: '1', COLOR: '0', TERM: 'dumb' })).not.toHaveProperty('NO_COLOR')
    expect(createTerminalEnvironment({ NO_COLOR: '1', COLOR: '0', TERM: 'dumb' })).not.toHaveProperty('COLOR')
  })

  it('keeps caller environment values that do not suppress color', () => {
    expect(createTerminalEnvironment({ TERM: 'screen-256color', COLORTERM: 'truecolor', SHELL: '/bin/zsh' })).toMatchObject({
      TERM: 'screen-256color',
      COLORTERM: 'truecolor',
      SHELL: '/bin/zsh'
    })
  })
})
