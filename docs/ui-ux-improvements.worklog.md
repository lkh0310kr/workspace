# UI/UX improvements — research worklog

> **Internal scratch pad.** Raw notes from ref-proj comparison (orca, vscode) and
> `apps/workspace` inventory. The concise outcome lives in
> [`ui-ux-improvements.md`](./ui-ux-improvements.md).

Last updated: **2026-09-09**

---

## Method

1. Cloned reference repos under `ref-proj/` (read-only):
   - `orca/` — already present; Tier 2 Electron UX reference
   - `vscode/` — shallow clone (`--depth 1`) for workbench/sash/quick-input patterns
2. Inventoried workspace renderer surfaces (`apps/workspace/src/renderer/src/`)
3. Cross-read `docs/DESIGN.md` v2 + recent CSS fixes (splitter hover, tokens)
4. Did **not** clone zed/logseq (disk/time); orca + vscode cover Electron + IDE baseline

---

## Workspace UI inventory (2026-09-09)

### Shell

| Surface | Component | CSS ~line |
|---------|-----------|-----------|
| Titlebar + settings | `AppTitlebar.tsx` | 287–409 |
| Workspace tab rail | `WorkspaceTabRail.tsx` | 479–671 |
| Layout / splits | `WorkspaceLayoutHost.tsx`, flexlayout | 429–477, 4388+ |
| Home dashboard | `dashboard/DashboardView.tsx` | 673–953 |
| Status bar | `ClaudeUsageStatusBar.tsx` | 380–409 |
| Quick Open | `QuickOpen.tsx` | 5126+ |
| Settings popovers | `SettingsDialog`, `AppSettingsDialog` | 5126+ |

### Pane kinds (`panes/kinds/*`)

`terminal`, `browser`, `code`, `markdown`, `viewer` (image/video/audio/PDF/EPUB/CAD/3D/hardware), `rss`, `japanese`

### Styles monolith

Single `assets/styles.css` (~5.6k lines). Token extraction planned in DESIGN.md v2 — not done yet.

---

## Reference: orca (`ref-proj/orca/`)

### Theme / tokens

- **File:** `src/renderer/src/assets/main.css`
- Tailwind v4 `@theme inline` bridges shadcn semantic colors → CSS vars
- Notable domain tokens: `--tab-group-split-divider*`, `--terminal-pane-title-on-dark-*` / `-on-light-*`, `--agent-question`, git decoration colors
- `@custom-variant can-hover (@media (hover: hover))` — hover-reveal without breaking touch
- `.theme-transition-disabled` + `document-theme.ts` — atomic theme swap

**Tone:** rounded shadcn, `--radius: 0.625rem`, floating shadows — **port behavior, not aesthetics**

### Quick Open

- **Files:** `components/QuickOpen.tsx`, `components/ui/command.tsx`, `quick-open-search.ts`, `quick-open-file-list.ts`
- cmdk + Radix CommandDialog
- `useDeferredValue(query)` for responsive typing
- Close linger 300ms before unmount
- `useModalReturnFocus` — Esc returns focus to prior surface; file open skips restore
- Footer pills: Enter / Esc / ↑↓
- File-type icons + dirname/filename split
- Loading / error / truncated states

**Workspace gap:** `QuickOpen.tsx` — plain path list, no loading, no footer, no icons, eager `listAllFiles`

### Tab / split

- **Files:** `main.css` L732–776 (`.tab-group-split-resize-handle`), `TabGroupSplitLayout.tsx`, `TabGroupPanel.tsx`
- 6px hit area, 3px visible `::after` line, hover → `-strong` color
- Pointer capture; ratio commit on pointerup (not per-frame store writes)
- Unfocused split group: `opacity-95` + accent bottom border when focused
- Focused-only tab strip actions (close split, quick commands)

**Workspace:** flexlayout-react + CSS vars; splitter hover was broken until 2026-09-09 fix (`--flexlayout-color-splitter*`)

### Settings / onboarding

- Full settings page: `settings-page-renderer.tsx`, `SettingsSidebar.tsx`, `settings-search.ts`
- Onboarding flow: `OnboardingFlow.tsx`, `ThemeStep.tsx` (live preview)
- Hover-reveal enforced by test: `hover-reveal-touch-action-visibility.test.ts`

### Terminal chrome

- `terminal.css` + `terminal-title-contrast.ts` + `data-pane-title-surface="light|dark"`
- Title bar colors follow terminal background luminance, not app theme

---

## Reference: VS Code (`ref-proj/vscode/`)

### Layout primitives (do not reimplement wholesale)

| Primitive | Path | Notes |
|-----------|------|-------|
| Sash | `src/vs/base/browser/ui/sash/sash.ts`, `sash.css` | 4px hit, hover widens; `--vscode-sash-size` |
| SplitView | `src/vs/base/browser/ui/splitview/splitview.ts` | min/max, snap, layout priority |
| Grid | `src/vs/base/browser/ui/grid/grid.ts` | 2D nested splits |
| EditorPart | `src/vs/workbench/browser/parts/editor/editorPart.ts` | serialization + DnD — too heavy |

**Takeaway:** flexlayout is fine; borrow **focus semantics** and **sash hover affordance**, not the Grid engine.

### Quick input

- `src/vs/platform/quickinput/browser/quickInputController.ts`
- Unified overlay for command palette, file pick, prompts
- Provider registry (`pickerQuickAccess.ts`, `commandsQuickAccess.ts`) — overkill for us

### Empty state / discoverability

- **EditorGroupWatermark** — `editorGroupWatermark.ts`
  - Shuffled shortcut list with live `KeybindingLabel` chips
  - Context-filtered entries (workspace vs empty window)
  - Entries: Go to File, Find in Files, Toggle Terminal, Open Settings…
- **Browser welcome** — `contrib/browserView/browser/browserWelcome.ts` (lighter empty pane)

### Focus / active group

- `editorgroupview.css` — inactive empty group opacity 0.5; focused empty gets `--vscode-editorGroup-focusedEmptyBorder`
- `editorGroupView.ts` — `onDidFocus`, scoped context for shortcuts

### Theme

- `src/vs/workbench/common/theme.ts` + `colorRegistry.ts`
- Semantic names → `--vscode-*` CSS vars (hundreds of tokens)
- **Port idea:** naming convention, not the registry/DI stack

### Keybinding labels

- `src/vs/base/browser/ui/keybindingLabel/keybindingLabel.ts`
- OS-aware rendering (⌘ vs Ctrl)
- Orca equivalent: `hooks/useShortcutLabel.ts` + `formatShortcutLabel`

---

## Workspace gaps (prioritized)

### P0 — daily friction

| Gap | Evidence | Best reference |
|-----|----------|----------------|
| Quick Open polish | No loading, icons, footer hints | orca `QuickOpen.tsx` |
| Keyboard discoverability | `shortcutRegistry.ts` dispatches only; no UI labels | vscode watermark / orca `useShortcutLabel` |
| Splitter / resize feedback | Fixed 2026-09-09; verify explorer resizer too | orca `tab-group-split-resize-handle` |
| Active tab affordance | Fixed `.pane-tab.active` underline | workspace tab rail pattern |

### P1 — polish

| Gap | Evidence | Best reference |
|-----|----------|----------------|
| Hover-reveal row actions | Explorer/tree actions always visible or missing | orca `can-hover:` + tests |
| Empty pane watermark | Per-kind empty CSS only; no unified “start here” | vscode `editorGroupWatermark.ts` |
| Quick Open focus return | Modal dismiss leaves focus ambiguous | orca `useModalReturnFocus.ts` |
| Settings growth path | Popover-only (theme + tab root) | orca settings sidebar + search |
| Terminal title contrast | Title uses app chrome colors | orca `terminal-title-contrast.ts` |
| Theme swap flicker | No transition guard | orca `theme-transition-disabled` |

### P2 — design system hygiene

| Gap | Evidence | Best reference |
|-----|----------|----------------|
| CSS monolith | 5.6k line `styles.css` | orca token layers + DESIGN.md v2 split plan |
| Semantic tokens | ~25 vars vs orca/vscode hundreds | DESIGN.md token table expansion |
| Accessibility | Sparse `focus-visible` on chrome buttons | vscode keybinding + focus rings |
| Command palette | Cmd+P files only | vscode `>` commands (subset only) |

### Explicit non-goals

- VS Code extension host, configuration registry, full Grid engine
- Orca shadcn rounded card aesthetic wholesale
- Activity bar, SCM gutter, minimap, multi-window auxiliary editors
- Dashboard as primary workspace (keep home optional; reduce SaaS card feel per DESIGN.md)

---

## Already fixed this session (2026-09-09)

Document in final doc as “done baseline”:

1. `--flexlayout-color-splitter*` + removed `flex: 0 0 1px` override
2. `.pane-tab.active` → `--shadow-inset-accent`
3. Global `* { box-shadow: none }` removed; tokenized radius/shadow/motion
4. Explorer resizer Orca-style `::after` line
5. DESIGN.md softened geometry/depth/motion rules

---

## Implementation sketch (for future PRs)

### PR A — Quick Open v2

- New `CommandSurface` component (sharp modal, reuse `--radius-lg`, `--shadow-overlay`)
- Port: deferred filter, loading row, file icons (simple mime map), footer with `useShortcutLabel`
- Port: `useModalReturnFocus` equivalent hook

### PR B — Shortcut labels

- `formatShortcutLabel(actionId)` reading `shortcutRegistry.ts`
- `.ui-kbd` CSS chip (flat, not orca pill)
- Wire into Quick Open footer, context menus, empty states

### PR C — Empty watermark

- `PaneEmptyWatermark.tsx` in `PaneGroup` when single empty terminal/editor
- 3–5 actions from registry: Open file, New terminal, Toggle explorer…

### PR D — Tokens split

- Extract `tokens.css` per DESIGN.md v2; no visual change PR

### PR E — Terminal title adaptive

- Port luminance check from orca `terminal-title-contrast.ts`
- `data-pane-title-surface` on terminal pane header

---

## Open questions

1. **Dashboard:** keep as home or demote to widget strip? DESIGN.md still anti-SaaS-card but allows modest radius.
2. **Command palette scope:** files-only vs `>` commands for pane actions?
3. **Settings:** stay popover until N>10 prefs, or invest in sidebar now?
4. **Geist / custom font:** orca bundles Geist; worth it for CJK fallback complexity?
5. **flexlayout vs custom split:** stay on flexlayout 0.10.x; only CSS/token fixes?

---

## File path index (quick rg)

```bash
# Workspace
rg -l "QuickOpen|PaneTabStrip|WorkspaceTabRail" apps/workspace/src/renderer

# Orca
rg "can-hover|tab-group-split|useModalReturnFocus" ref-proj/orca/src/renderer

# VS Code
rg "EditorGroupWatermark|monaco-sash|QuickInputController" ref-proj/vscode/src/vs
```

---

## Changelog

| Date | Notes |
|------|-------|
| 2026-09-09 | Initial worklog; cloned vscode; orca + workspace inventory; P0–P2 gaps |
