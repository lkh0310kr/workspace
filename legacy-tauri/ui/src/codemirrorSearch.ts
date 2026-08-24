import { keymap } from "@codemirror/view";
import {
  search,
  searchKeymap,
  openSearchPanel,
  closeSearchPanel,
  searchPanelOpen,
} from "@codemirror/search";

// @codemirror/search's own Mod-f binding always opens the panel — pressing
// it again while already open just refocuses it rather than closing.
const toggleSearchKeymap = keymap.of([
  {
    key: "Mod-f",
    run: (view) => (searchPanelOpen(view.state) ? closeSearchPanel(view) : openSearchPanel(view)),
  },
  ...searchKeymap.filter((binding) => binding.key !== "Mod-f"),
]);

/** Cmd+F search, toggling closed on a second press. CodeMirror's own
 * keymap only fires for whichever EditorView has focus, so this is
 * already scoped to one pane at a time without extra wiring. */
export const workspaceSearch = [search(), toggleSearchKeymap];
