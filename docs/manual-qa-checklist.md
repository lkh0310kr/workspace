# Manual QA checklist

Run before release or after large layout/embed changes. Dev: `cd electron && npm run dev`.

## Workspace tabs

- [ ] Switch workspace tab via rail — layout visible, no orphan popover blocking clicks
- [ ] Sidebar quick-switch (rail closed, hover sidebar toggle) opens and selects tab
- [ ] Close workspace tab (×) — remaining tab active, no stuck overlay

## Layout / drag

- [ ] Pane strip drag — split placeholder shows half-pane fill, drop creates split
- [ ] Tab chip drag within strip — reorder and merge into another pane
- [ ] Tab chip drag to empty area — new pane or edge split
- [ ] Splitter resize over browser pane — completes, browser clickable after release
- [ ] flexlayout pane drag (strip background) — works, popovers still open on chip click

## Browser

- [ ] Address bar: history suggestions, Enter navigates, Escape reverts to current URL
- [ ] Cmd+L focuses address bar when browser pane active
- [ ] Cmd+R reloads focused browser guest (not wrong pane)
- [ ] Reload/stop button toggles while loading
- [ ] Popover (settings) open — browser stays visible, clicks hit popover not page
- [ ] `target=_blank` opens new tab in same pane group

## Terminal / editor

- [ ] New terminal pane — shell prompt, scrollback after tab switch
- [ ] Editor tab switch — dirty indicator, tree width persists per tab item
- [ ] Cmd+W closes active pane tab (or dismisses settings first)

## Shortcuts

- [ ] Cmd+, opens app settings
- [ ] Cmd+Plus/Minus zooms active **pane** (flexlayout tab), not browser guest zoom

## Debug (dev only)

- [ ] InteractionDebugPanel: `overlayBlockCount` 0 when idle
- [ ] No macOS menu spam in packaged build (Electron ≥42 reduces upstream log)
