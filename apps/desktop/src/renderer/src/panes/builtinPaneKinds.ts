import { registerPaneKind } from './paneKindRegistry'
import { terminalPaneKind } from '../features/terminal/TerminalPaneKind'
import { browserPaneKind } from '../features/browser/BrowserPaneKind'
import { codePaneKind, markdownPaneKind } from '../features/editor/EditorPaneKinds'
import { viewerPaneKind } from '../features/editor/ViewerPaneKind'

let registered = false

// Registration order is also picker-list order (paneKindPickerOptions
// iterates the registry in insertion order) — terminal, browser, (code:
// no picker entries), markdown, and viewer×3.
// hand-written TAB_KIND_OPTIONS order for the pre-existing kinds exactly.
export function registerBuiltinPaneKinds(): void {
  if (registered) return
  registered = true
  for (const def of [
    terminalPaneKind,
    browserPaneKind,
    codePaneKind,
    markdownPaneKind,
    viewerPaneKind
  ]) {
    registerPaneKind(def)
  }
}
