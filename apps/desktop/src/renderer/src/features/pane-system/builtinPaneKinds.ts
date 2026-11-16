import { registerPaneKind } from './paneKindRegistry'
import { terminalPaneKind } from './kinds/terminalPaneKind'
import { browserPaneKind } from './kinds/browserPaneKind'
import { codePaneKind, markdownPaneKind } from '../editor/EditorPaneKinds'
import { viewerPaneKind } from '../editor/ViewerPaneKind'

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
