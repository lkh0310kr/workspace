import { registerPaneKind } from "./paneKindRegistry";
import { terminalPaneKind } from "./kinds/terminalKind";
import { browserPaneKind } from "./kinds/browserKind";
import { codePaneKind, markdownPaneKind } from "./kinds/editorKind";
import { rssPaneKind } from "./kinds/rssKind";
import { viewerPaneKind } from "./kinds/viewerKind";

let registered = false;

// Registration order is also picker-list order (paneKindPickerOptions
// iterates the registry in insertion order) — terminal, browser, (code:
// no picker entries), markdown, rss, viewer×3, matching the original
// hand-written TAB_KIND_OPTIONS order exactly.
export function registerBuiltinPaneKinds(): void {
  if (registered) return;
  registered = true;
  for (const def of [terminalPaneKind, browserPaneKind, codePaneKind, markdownPaneKind, rssPaneKind, viewerPaneKind]) {
    registerPaneKind(def);
  }
}
