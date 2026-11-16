import type { ITheme } from '@xterm/xterm'
import type { ResolvedTheme } from './theme'

// Ported from ref-proj/orca/src/renderer/src/lib/terminal-themes/defaults.ts.
// The dark palette is tuned for Workspace's Onyx-like graphite surfaces; light
// keeps the Tango-derived palette.
export const XTERM_THEMES: Record<ResolvedTheme, ITheme> = {
  dark: {
    scrollbarSliderBackground: 'rgba(155, 158, 166, 0.34)',
    scrollbarSliderHoverBackground: 'rgba(155, 158, 166, 0.5)',
    scrollbarSliderActiveBackground: 'rgba(155, 158, 166, 0.68)',
    background: '#111214',
    foreground: '#d8dade',
    cursor: '#d8dade',
    cursorAccent: '#111214',
    selectionBackground: '#343741',
    selectionForeground: '#e2e4e7',
    black: '#111214',
    red: '#b66f72',
    green: '#869b70',
    yellow: '#b59b60',
    blue: '#727fb7',
    magenta: '#9d7da8',
    cyan: '#719894',
    white: '#c5c7cc',
    brightBlack: '#6f737c',
    brightRed: '#c98183',
    brightGreen: '#97a982',
    brightYellow: '#c6ae74',
    brightBlue: '#8794c4',
    brightMagenta: '#ad8cb8',
    brightCyan: '#82a9a5',
    brightWhite: '#e2e4e7'
  },
  light: {
    scrollbarSliderBackground: 'rgba(72, 73, 80, 0.36)',
    scrollbarSliderHoverBackground: 'rgba(72, 73, 80, 0.56)',
    scrollbarSliderActiveBackground: 'rgba(72, 73, 80, 0.76)',
    background: '#f2f3f5',
    foreground: '#232428',
    cursor: '#232428',
    cursorAccent: '#f2f3f5',
    selectionBackground: '#c7cbff',
    selectionForeground: '#232428',
    black: '#232428',
    red: '#cc0000',
    green: '#4e9a06',
    yellow: '#8e7700',
    blue: '#3465a4',
    magenta: '#75507b',
    cyan: '#05727e',
    white: '#6a6a6a',
    brightBlack: '#555753',
    brightRed: '#ef2929',
    brightGreen: '#1b7a1b',
    brightYellow: '#6d5a00',
    brightBlue: '#204a87',
    brightMagenta: '#ad7fa8',
    brightCyan: '#034b50',
    brightWhite: '#3d3d3d'
  }
}

export const TERMINAL_SCROLLBACK_ROWS = 5000

export function getTerminalSearchDecorations(theme: ResolvedTheme) {
  if (theme === 'light') {
    return {
      matchBackground: '#ffe08a',
      matchBorder: '#e6c200',
      matchOverviewRuler: '#ffcc00',
      activeMatchBackground: '#ff9900',
      activeMatchBorder: '#cc7a00',
      activeMatchColorOverviewRuler: '#ff9900'
    }
  }
  return {
    matchBackground: '#433d2c',
    matchBorder: '#5a5138',
    matchOverviewRuler: '#8f793e',
    activeMatchBackground: '#684b36',
    activeMatchBorder: '#9c794b',
    activeMatchColorOverviewRuler: '#a77b42'
  }
}
