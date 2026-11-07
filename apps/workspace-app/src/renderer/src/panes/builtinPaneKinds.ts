import { registerPaneKind } from "./paneKindRegistry";
import { terminalPaneKind } from "./kinds/terminalKind";
import { browserPaneKind } from "./kinds/browserKind";
import { codePaneKind, markdownPaneKind } from "./kinds/editorKind";
import { viewerPaneKind } from "./kinds/viewerKind";
import { pkmsPaneKind } from "./kinds/pkmsKind";

let registered = false;

// Registration order is also picker-list order (paneKindPickerOptions
// iterates the registry in insertion order) — terminal, browser, (code:
// no picker entries), markdown, viewer×3, and PKMS.
// hand-written TAB_KIND_OPTIONS order for the pre-existing kinds exactly.
export function registerBuiltinPaneKinds(): void {
  if (registered) return;
  registered = true;
  for (const def of [
    terminalPaneKind,
    browserPaneKind,
    codePaneKind,
    markdownPaneKind,
    viewerPaneKind,
    pkmsPaneKind,
  ]) {
    registerPaneKind(def);
  }
}
