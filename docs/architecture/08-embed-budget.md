# Embed budget (Phase 3)

Limits native embed mount count so workspace tabs × panes do not grow Chromium guest / xterm instances without bound.

## Browser — WebviewRegistry

**Source:** `electron/src/renderer/src/embeds/WebviewRegistry.ts`

| Policy | Value |
|--------|-------|
| Max live guests | 4 (`WEBVIEW_LRU_CAPACITY`) |
| Session data | `PaneTabItem` in layout JSON (`url`, `zoomFactor`, `title`, `favicon`) |
| Slot holder | `paneVisible` (flexlayout pane live) — **not** per chip switch |
| Chip input | `chipActive` → webview `visibility` + IC `setBrowserPaneVisible` |
| Eviction priority | Unpinned (inactive chip) slots first, then LRU |

### Lifecycle

1. Pane chip becomes visible → `requestWebviewSlot(sessionKey)`
2. At capacity → LRU peer evicted (`onEvict` destroys its `<webview>`)
3. Chip hidden → `releaseWebviewSlot` (guest destroyed, URL kept in layout)
4. Chip visible again → new guest loads `item.url` from layout

### Split layout (browser + browser)

Both panes may be visible simultaneously. Up to **4** live guests across the whole app. A 5th visible browser chip evicts the least-recently-used guest; evicted pane shows a parked placeholder until refocused or navigated.

Native guest z-index limits are unchanged — see [06-browser-embeds.md](./06-browser-embeds.md).

## Terminal — cold park

**Source:** `electron/src/renderer/src/embeds/useTerminalColdPark.ts`

| Policy | Value |
|--------|-------|
| Park delay | 30s after pane hidden or chip inactive |
| Session | Main-process `PtySession` + replay on remount (`connectPanePty`) |
| Unmount | xterm + pane-manager DOM disposed; shell shows dimmed host |

Wake: pane visible **and** chip active → immediate remount.

## Workspace tabs

Inactive workspace tabs keep layout hosts mounted (`visibility: hidden`) but:

- Browser guests release LRU slots when their pane chips are not visible
- IC hides any remaining webviews on inactive workspace tab

## Debugging

| Symptom | Check |
|---------|-------|
| Browser blank “unloaded to save memory” | Expected when LRU evicted — click tab or navigate |
| Terminal empty after 30s in background | Cold park — switch back to wake |
| `getWebviewSlotCount()` in dev | Should stay ≤ 4 |

## Related

- [06-browser-embeds.md](./06-browser-embeds.md)
- [07-future-phases.md](./07-future-phases.md)
