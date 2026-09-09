# Design Context

## Design Philosophy

Create a desktop application inspired by the visual philosophy of **Zed** and **Obsidian**.

The interface should feel:

* Quiet
* Dense
* Precise
* Technical
* Focused
* Minimal
* Professional
* Editor-centric

The UI should feel like a **tool for extended daily use**, not a marketing website or consumer-oriented dashboard.

Visual design should emerge from **content, typography, alignment, contrast, and structure** rather than decoration.

---

## Core Principle

> **Content and structure create the visual design. Decoration does not.**

Every visual element should have a functional reason to exist.

Prefer removing an element over adding another visual treatment to make the interface "feel designed."

When uncertain, choose the simpler and quieter solution.

---

## Geometry

### Mostly sharp, occasionally soft

Default chrome (tabs, buttons, pane headers) stays **rectangular** (`border-radius: 0`).

Small radii are allowed where they improve affordance or readability:

| Token | Value | Use |
|-------|-------|-----|
| `--radius-sm` | 3px | Splitter drag handle, scroll thumbs |
| `--radius-md` | 6px | Toolbar chips, inline badges |
| `--radius-lg` | 8px | Modals, Quick Open, anchored popovers |

Avoid pill shapes (`999px`) on primary chrome. Dashboard/widgets may use modest radius.

---

## Depth

### Flat workspace, lifted overlays

The main workspace stays visually flat — hierarchy from contrast, borders, typography.

**Shadows are allowed sparingly** for floating layers that detach from the canvas:

| Token | Use |
|-------|-----|
| `--shadow-overlay` | Quick Open, settings popovers |
| `--shadow-inset-accent` | Active tab underline (inset, not drop shadow) |

Do not stack multiple shadows or use shadows on every panel. No glassmorphism.

---

## Spacing Philosophy

### Remove Unnecessary Margin and Padding

Spacing must have a structural purpose.

Do not add whitespace simply because a layout feels too dense.

Prefer compact relationships between related information.

Spacing should communicate:

* Grouping
* Hierarchy
* Separation
* Reading rhythm

Avoid:

* Large empty margins
* Excessive internal padding
* Large gaps between related elements
* Artificial whitespace around small pieces of information

The default assumption should be:

> **If spacing can be reduced without harming comprehension, reduce it.**

---

## Density

The application should have a **high information density**.

Users should be able to see a substantial amount of information without scrolling unnecessarily.

Avoid the visual conventions of:

* SaaS dashboards
* Marketing websites
* Large card layouts
* Spacious landing pages
* Oversized content blocks

Prefer the density of:

* Code editors
* IDEs
* Knowledge-management tools
* Developer utilities
* Professional desktop software

The UI should feel efficient rather than spacious.

---

## Visual Hierarchy

Hierarchy should primarily come from:

1. Typography
2. Font weight
3. Font size
4. Color contrast
5. Alignment
6. Position
7. Borders
8. Background contrast

Do not create hierarchy through:

* Shadows
* Rounded containers
* Excessive whitespace
* Decorative backgrounds
* Gradients
* Large visual treatments

---

## Surfaces

Surfaces should feel like **parts of a single workspace**, not independent floating objects.

Prefer flat visual planes.

Background differences should be subtle and intentional.

Use slight changes in:

* Background color
* Contrast
* Border color
* Opacity

Avoid visually separating every region into its own "card."

The application should feel like a **continuous workspace**.

---

## Borders

Borders should be subtle and functional.

Use borders only when they communicate a meaningful structural boundary.

Prefer:

* Thin borders
* Low visual contrast
* Consistent treatment

Do not use borders as decoration.

A region should not receive a border merely because it is a distinct UI element.

---

## Typography

Typography is a primary part of the visual identity.

Text should carry much of the hierarchy that other interfaces would achieve through containers and decoration.

Typography should feel:

* Compact
* Clear
* Technical
* Restrained
* Highly readable

Avoid oversized typography.

Headings should establish hierarchy without dominating the workspace.

Monospace typography may be used where it reinforces a technical or editor-oriented character.

---

## Color Philosophy

Use a restrained, mostly neutral palette.

Color should communicate meaning rather than decoration.

Use accent colors intentionally for:

* Focus
* Selection
* Active state
* Links
* Status
* Errors
* Warnings
* Success

Avoid excessive color variation.

The interface should remain visually calm even when many elements are visible.

Background colors should be close enough in value that the overall workspace still feels unified.

---

## Contrast

Contrast should be subtle but sufficient.

Use contrast to establish hierarchy rather than dramatic visual separation.

Prefer:

* Quiet inactive states
* Clear active states
* Restrained selection states
* Subtle background transitions
* Strong text readability

Avoid unnecessarily high-contrast borders and surfaces.

---

## Alignment

Alignment should be strict.

Visual relationships should feel intentional and predictable.

Maintain consistent:

* Left edges
* Baselines
* Indentation
* Vertical rhythm
* Content boundaries

Avoid arbitrary offsets or visually "almost aligned" elements.

Precision is part of the aesthetic.

---

## Interaction Philosophy

Interaction states should be **quiet but unmistakable**.

Changes in state should primarily be communicated through:

* Background
* Text color
* Contrast
* Border
* Opacity

Avoid exaggerated interaction effects.

Do not use:

* Shadows for hover
* Rounded hover containers
* Large scale transformations
* Decorative animations

Interactions should feel immediate and native to a professional desktop tool.

---

## Motion Philosophy

Motion should be **short and purposeful** — enough to feel responsive, not decorative.

| Token | Typical use |
|-------|-------------|
| `--motion-fast` (100ms) | Splitter hover, hover background |
| `--motion-hover-delay` (50ms) | Suppress flicker on fast pointer passes |

Use motion for:

* Splitter / resize handle hover feedback
* Opacity fades (unfocused pane groups, hover-reveal actions)
* Theme swap (optional `theme-transition-disabled` to prevent stagger)

Avoid large scale transforms, bouncy easing, or motion that delays interaction.

---

## Whitespace Philosophy

Whitespace is not inherently good.

Use whitespace when it improves:

* Reading
* Grouping
* Hierarchy
* Orientation

Do not use whitespace as decoration.

The desired feeling is **compact clarity**, not spacious luxury.

---

## Emotional Tone

The visual tone should be:

**Quiet over expressive.**

**Functional over decorative.**

**Precise over playful.**

**Dense over spacious.**

**Flat over dimensional.**

**Technical over commercial.**

**Focused over attention-grabbing.**

The interface should disappear into the user's workflow rather than constantly demanding attention.

---

## Anti-Patterns

Avoid any design that resembles:

* Modern SaaS dashboards
* Card-based admin panels
* Marketing landing pages
* Glassmorphism
* Neumorphism
* Floating UI compositions
* Excessive rounded corners
* Pill-heavy interfaces
* Shadow-heavy interfaces
* Gradient-heavy interfaces
* Excessive whitespace
* Oversized typography
* Decorative illustrations
* Visual clutter

---

## Decision Rule

When making a visual design decision, prioritize in this order:

1. **Clarity**
2. **Information density**
3. **Consistency**
4. **Efficiency**
5. **Visual restraint**
6. **Aesthetic detail**

If two solutions are equally usable, choose the one with:

* Less decoration
* Less spacing
* Less visual noise
* Flatter surfaces
* Sharper geometry
* Simpler hierarchy

### Final Principle

> **Make the interface feel inevitable, not designed.**

It should feel like a precise workspace that has been refined over years of use—not a collection of visually impressive UI components.

---

## Implementation Tokens

CSS custom properties in `apps/workspace/src/renderer/src/assets/styles.css`:

| Token | Role |
|-------|------|
| `--bg-base` | Primary workspace background |
| `--bg-surface` | Chrome, headers, sidebars |
| `--bg-hover` | Hover / subtle highlight |
| `--bg-active` | Selection / active state |
| `--border` | Structural dividers |
| `--text` | Primary text |
| `--text-muted` | Secondary labels |
| `--accent` | Focus, links, active indicators |
| `--radius-sm` / `--radius-md` / `--radius-lg` | Allowed corner radii |
| `--shadow-overlay` | Modal / popover elevation |
| `--shadow-inset-accent` | Active tab underline |
| `--motion-fast` / `--motion-hover-delay` | Interaction transitions |
| `--flexlayout-color-splitter*` | Pane split divider idle / hover / drag |
| `--font-ui` | UI chrome |
| `--font-mono` | Editor, terminal |
| `--scroll-size` / `--scroll-thumb` | Unified scrollbars (`.scroll-region`) |
| `.ui-btn` | Shared button chrome |

---

## Design System v2 — Orca benchmark & migration (2026-09-09)

Reference: `ref-proj/orca/` (Tier 2 UX). Orca uses Tailwind v4 + shadcn-style
primitives; **this app keeps the Zed/Obsidian philosophy above** — do not copy
Orca's rounded cards, floating shadows, or SaaS spacing wholesale.

### Current gaps (workspace vs orca vs DESIGN.md)

| Area | Workspace today | Orca | Action |
|------|-----------------|------|--------|
| CSS architecture | Single `styles.css` (~5.5k lines) | `main.css` + Tailwind `@theme` + per-feature CSS | Split into `tokens.css`, `base.css`, `components/*.css` |
| Token coverage | ~20 vars (`--bg-*`, `--text-*`) | Semantic set: `background`, `sidebar`, `popover`, status/git/agent hues, adaptive terminal chrome | Expand tokens; keep `border-radius: 0` default |
| DESIGN.md compliance | ~65 rules use `border-radius ≥ 4px` or shadows | Rounded shadcn (intentionally different product tone) | Audit dashboard, popovers, hardware-sim, scrollbars |
| Quick Open | Plain path list, no icons/footer hints | `CommandDialog`, file-type icons, keyboard legend, deferred search | Rebuild on shared `CommandSurface` primitive |
| Hover / touch | Always-on or opacity hover | `can-hover:` — controls visible on touch | Port hover-reveal pattern |
| Typography | System UI stack | Bundled Geist | Optional: ship one variable UI font; keep CJK fallbacks |
| Light theme | Partial (`data-theme=light`) | Full paired token blocks | Complete light token block in `:root[data-theme=light]` |
| Component docs | Philosophy only | Implicit in shadcn components | Add **Component catalog** table below |

### Target file layout

```
apps/workspace/src/renderer/src/assets/
  tokens.css          # :root semantic vars (dark + light)
  base.css            # reset, scroll-region, typography
  components/
    chrome.css        # titlebar, tab rails, status bar
    pane.css          # PaneTabStrip, PaneFrame, splitters
    overlay.css       # QuickOpen, Popover, ContextMenu, dialogs
    dashboard.css     # home widgets — flat panels, not cards
    editor.css        # CodeMirror, markdown
    terminal.css      # xterm overrides (move from terminal-xterm-overrides.css)
  styles.css          # @import hub only
```

### Token v2 (semantic, sharp)

Keep existing names as aliases during migration; add:

| Token | Role |
|-------|------|
| `--surface-base` | Workspace canvas (= `--bg-base`) |
| `--surface-chrome` | Titlebar, tab strips (= `--bg-surface`) |
| `--surface-overlay` | Menus, quick open, dialogs |
| `--surface-raised` | Inputs on chrome |
| `--text-primary` / `--text-secondary` / `--text-tertiary` | Text hierarchy |
| `--accent-muted` | Selection wash (no glow) |
| `--status-success` / `--status-warning` / `--status-error` | Status only |
| `--focus-ring` | 1px inset border, not box-shadow |
| `--space-1` … `--space-4` | 2 / 4 / 8 / 12px — replace ad-hoc padding |
| `--chrome-h` | Unchanged (34px) |

**Hard rules (updated):** default chrome stays sharp; overlays may use `--radius-lg` +
`--shadow-overlay`; splitters must show hover + drag feedback via flexlayout tokens;
no card-grid SaaS dashboard density.

### Known UI fixes (2026-09-09)

| Bug | Cause | Fix |
|-----|-------|-----|
| Pane split divider hover invisible | `background: … !important` + `flex: 0 0 1px` overrode flexlayout hover | Use `--flexlayout-color-splitter*` tokens; remove flex override |
| Focused pane group no accent | `.pane-group-host-focused .pane-header` targeted browser nav only (dead rule) | Opacity dimming + `--shadow-inset-accent` on `.pane-tab.active` |

### Component catalog (shared primitives)

| Primitive | Used by | Notes |
|-----------|---------|-------|
| `.ui-btn` / `.ui-btn-ghost` | Settings, pane actions | Already exists; extend sizes `sm/md` |
| `.ui-input` | Rename fields, search, address bar | Single height (28px), sharp |
| `.ui-menu` | ContextMenu, Popover, AppSettings | Flat list; no shadow |
| `.ui-command` | QuickOpen, future palette | Orca CommandDialog behavior, our geometry |
| `.ui-tab` | WorkspaceTabRail, PaneTabStrip | Shared active underline |
| `.scroll-region` | All scroll surfaces | Already exists |

### Migration order

1. Extract `tokens.css` + `:root[data-theme=light]` parity
2. Flatten dashboard widgets (remove `border-radius: 10px` card look)
3. Unify QuickOpen → `.ui-command`
4. Split `styles.css` by domain (no visual change per PR)
5. Hover-reveal + `can-hover` for explorer row actions
6. Delete duplicate token names once call sites migrated

### Orca patterns worth porting (UX, not aesthetics)

- Terminal pane title colors that adapt to terminal background luminance
- Quick Open footer keyboard hints (`Enter`, `↑↓`)
- Theme swap without staggered CSS transitions (`theme-transition-disabled`)
- Modal focus return (`useModalReturnFocus` equivalent)
- File-type icons in file pickers

### Orca patterns to reject

- `--radius: 0.625rem` and pill buttons
- `--shadow-floating` on popovers
- Card/dashboard SaaS density
- shadcn default padding (`p-4`, `gap-4` everywhere)

