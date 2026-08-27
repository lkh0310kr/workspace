import { EditorView, keymap, type Panel, type ViewUpdate } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import {
  search,
  searchKeymap,
  openSearchPanel,
  closeSearchPanel,
  searchPanelOpen,
  getSearchQuery,
  setSearchQuery,
  SearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
} from "@codemirror/search";

// VSCode-parity in-editor Find/Replace (Cmd+F) — a custom createPanel
// replacing @codemirror/search's stock one, which has no live match
// count ("3 of 12") and plain checkboxes instead of the Aa/Ab/.* toggle
// buttons this app already uses for Find-in-Files (SearchPanel.tsx). All
// actual matching/highlighting/replace logic is still CodeMirror's own
// (SearchQuery, setSearchQuery, findNext/Previous, replaceNext/All) —
// this only reskins the UI and adds the count. Verified against
// VSCode's own findWidget.ts (ref-proj/vscode): "{n} of {total}" /
// "No results" wording and a capped "+" count both match its
// NLS_MATCHES_LOCATION/MATCHES_LIMIT behavior (VSCode caps at 19999; we
// cap lower since CodeMirror's SearchCursor re-scans from scratch on
// every keystroke rather than an incrementally-maintained index).
const MATCH_COUNT_CAP = 999;

function computeMatchInfo(state: EditorState): { total: number; current: number; capped: boolean } {
  const query = getSearchQuery(state);
  if (!query.valid) return { total: 0, current: 0, capped: false };
  const cursor = query.getCursor(state);
  const sel = state.selection.main;
  let total = 0;
  let current = 0;
  let capped = false;
  for (let result = cursor.next(); !result.done; result = cursor.next()) {
    total++;
    if (result.value.from === sel.from && result.value.to === sel.to) current = total;
    if (total >= MATCH_COUNT_CAP) {
      capped = true;
      break;
    }
  }
  return { total, current, capped };
}

function withQuery(state: EditorState, patch: Partial<ConstructorParameters<typeof SearchQuery>[0]>): SearchQuery {
  const q = getSearchQuery(state);
  return new SearchQuery({
    search: q.search,
    caseSensitive: q.caseSensitive,
    regexp: q.regexp,
    wholeWord: q.wholeWord,
    replace: q.replace,
    ...patch,
  });
}

class VscodeSearchPanel implements Panel {
  dom: HTMLElement;
  top = true;

  private view: EditorView;
  private searchField: HTMLInputElement;
  private replaceField: HTMLInputElement;
  private replaceRow: HTMLElement;
  private toggleReplaceBtn: HTMLButtonElement;
  private caseBtn: HTMLButtonElement;
  private wordBtn: HTMLButtonElement;
  private regexBtn: HTMLButtonElement;
  private countEl: HTMLElement;
  private prevBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private replaceOpen = false;
  private lastQuery: SearchQuery | null = null;
  private lastSelFrom = -1;
  private lastSelTo = -1;

  constructor(view: EditorView) {
    this.view = view;

    const query = getSearchQuery(view.state);

    this.toggleReplaceBtn = button("▸", "Toggle Replace", "cm-vs-toggle-replace", () => {
      this.replaceOpen = !this.replaceOpen;
      this.syncReplaceVisibility();
      if (this.replaceOpen) this.replaceField.focus();
      else this.searchField.focus();
    });

    this.searchField = input(query.search, "Find", true);
    this.searchField.addEventListener("input", () => {
      this.dispatchQuery(withQuery(this.view.state, { search: this.searchField.value }));
    });
    this.searchField.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) findPrevious(this.view);
        else findNext(this.view);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeSearchPanel(this.view);
      }
    });

    this.caseBtn = toggle("Aa", "Match Case (Alt+C)", () => this.flip("caseSensitive"));
    this.wordBtn = toggle("Ab", "Match Whole Word (Alt+W)", () => this.flip("wholeWord"));
    this.regexBtn = toggle(".*", "Use Regular Expression (Alt+R)", () => this.flip("regexp"));

    this.countEl = document.createElement("span");
    this.countEl.className = "cm-vs-count";

    this.prevBtn = button("↑", "Previous Match (Shift+Enter)", "cm-vs-nav", () => findPrevious(this.view));
    this.nextBtn = button("↓", "Next Match (Enter)", "cm-vs-nav", () => findNext(this.view));
    const closeBtn = button("×", "Close (Escape)", "cm-vs-close", () => closeSearchPanel(this.view));

    const findRow = document.createElement("div");
    findRow.className = "cm-vs-row";
    const fieldWrap = document.createElement("div");
    fieldWrap.className = "cm-vs-field-wrap";
    fieldWrap.append(this.searchField, this.caseBtn, this.wordBtn, this.regexBtn);
    findRow.append(this.toggleReplaceBtn, fieldWrap, this.countEl, this.prevBtn, this.nextBtn, closeBtn);

    this.replaceField = input(query.replace, "Replace", false);
    this.replaceField.addEventListener("input", () => {
      this.dispatchQuery(withQuery(this.view.state, { replace: this.replaceField.value }));
    });
    this.replaceField.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        replaceNext(this.view);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeSearchPanel(this.view);
      }
    });
    const replaceOneBtn = button("Replace", "Replace", "cm-vs-text-button", () => replaceNext(this.view));
    const replaceAllBtn = button("Replace All", "Replace All", "cm-vs-text-button", () => replaceAll(this.view));

    this.replaceRow = document.createElement("div");
    this.replaceRow.className = "cm-vs-row cm-vs-replace-row";
    const replaceSpacer = document.createElement("span");
    replaceSpacer.className = "cm-vs-spacer";
    this.replaceRow.append(replaceSpacer, this.replaceField, replaceOneBtn, replaceAllBtn);

    this.dom = document.createElement("div");
    this.dom.className = "cm-search cm-vs-search";
    this.dom.append(findRow, this.replaceRow);

    this.syncReplaceVisibility();
    this.syncToggleButtons(query);
    this.updateCount();
  }

  private flip(field: "caseSensitive" | "wholeWord" | "regexp"): void {
    const q = getSearchQuery(this.view.state);
    this.dispatchQuery(withQuery(this.view.state, { [field]: !q[field] }));
    this.searchField.focus();
  }

  private dispatchQuery(query: SearchQuery): void {
    this.view.dispatch({ effects: setSearchQuery.of(query) });
  }

  private syncReplaceVisibility(): void {
    this.replaceRow.style.display = this.replaceOpen ? "flex" : "none";
    this.toggleReplaceBtn.textContent = this.replaceOpen ? "▾" : "▸";
    this.toggleReplaceBtn.classList.toggle("active", this.replaceOpen);
  }

  private syncToggleButtons(query: SearchQuery): void {
    this.caseBtn.classList.toggle("active", query.caseSensitive);
    this.wordBtn.classList.toggle("active", query.wholeWord);
    this.regexBtn.classList.toggle("active", query.regexp);
  }

  private updateCount(): void {
    const query = getSearchQuery(this.view.state);
    if (!query.search) {
      this.countEl.textContent = "";
      this.countEl.classList.remove("cm-vs-count-empty");
      return;
    }
    const { total, current, capped } = computeMatchInfo(this.view.state);
    if (total === 0) {
      this.countEl.textContent = "No results";
      this.countEl.classList.add("cm-vs-count-empty");
      return;
    }
    this.countEl.classList.remove("cm-vs-count-empty");
    const totalLabel = capped ? `${total}+` : String(total);
    this.countEl.textContent = current > 0 ? `${current} of ${totalLabel}` : totalLabel;
  }

  update(update: ViewUpdate): void {
    const query = getSearchQuery(update.state);
    const sel = update.state.selection.main;
    const queryChanged = !this.lastQuery || !query.eq(this.lastQuery);
    const selChanged = sel.from !== this.lastSelFrom || sel.to !== this.lastSelTo;
    if (!queryChanged && !update.docChanged && !selChanged) return;

    if (queryChanged) {
      if (this.searchField.value !== query.search) this.searchField.value = query.search;
      if (this.replaceField.value !== query.replace) this.replaceField.value = query.replace;
      this.syncToggleButtons(query);
    }
    this.lastQuery = query;
    this.lastSelFrom = sel.from;
    this.lastSelTo = sel.to;
    this.updateCount();
  }

  mount(): void {
    this.searchField.select();
  }
}

function input(value: string, placeholder: string, isMainField: boolean): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "text";
  el.value = value;
  el.placeholder = placeholder;
  el.spellcheck = false;
  el.autocomplete = "off";
  if (isMainField) el.setAttribute("main-field", "true");
  return el;
}

function button(label: string, title: string, className: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `cm-vs-btn ${className}`;
  el.title = title;
  el.textContent = label;
  // mousedown, not click — a click first fires blur on the focused input,
  // which CodeMirror's own findNext/Previous etc. don't need but keeps
  // the just-typed selection from flickering before the command runs.
  el.addEventListener("mousedown", (e) => e.preventDefault());
  el.addEventListener("click", onClick);
  return el;
}

function toggle(label: string, title: string, onClick: () => void): HTMLButtonElement {
  return button(label, title, "cm-vs-toggle", onClick);
}

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
export const workspaceSearch = [
  search({ top: true, createPanel: (view) => new VscodeSearchPanel(view) }),
  toggleSearchKeymap,
];
