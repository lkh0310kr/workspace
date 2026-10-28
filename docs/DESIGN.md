# Workspace Design Guide

## Direction

Workspace is a desktop tool for people who spend long sessions in code, terminals, browsers, and project files. Keep its familiar workbench structure and information density, while giving the interface a more finished, welcoming feel.

Use **Discord** as the color reference and **Orca** as the interaction reference:

- Discord: charcoal surfaces, soft neutral text, restrained separators, and blurple for selection and primary actions.
- Orca: clean desktop chrome, clear focus states, and direct input handling.
- Workspace: preserve the existing pane, tab, sidebar, and titlebar model. Improve their styling before proposing new navigation or large layout changes.

The goal is a focused developer workspace with enough warmth and personality to feel considered. Do not turn it into a marketing page or a generic admin dashboard.

## Layout and density

- Keep the current titlebar, workspace tabs, panes, sidebars, and status areas in their established places.
- Favor useful information density, but allow breathing room around headings and grouped content.
- Make small layout changes when they improve scanning, alignment, or responsive behavior. Large structural changes need a clear user benefit.
- Group related content visually. Cards are welcome for dashboard modules, recent projects, and distinct settings sections when they help scanning.
- Use consistent spacing and align controls to nearby content. Avoid both cramped controls and oversized empty regions.

## Surfaces and geometry

Build hierarchy from a mix of background, border, typography, and spacing. The main editor area should still read as one work surface, while dialogs, menus, and separate dashboard modules may sit on subtly raised surfaces.

Use corner rounding as a useful design tool:

| Token | Starting value | Common use |
| --- | ---: | --- |
| `--radius-sm` | 4px | Inputs, compact buttons, small controls |
| `--radius-md` | 6px | Cards, tab groups, tool panels |
| `--radius-lg` | 8px | Dialogs, command surfaces, larger overlays |

Use larger radii when they make a surface easier to recognize. Reserve pill shapes for compact status labels and chips. Keep separators subtle and use them where they clarify ownership or grouping.

A soft shadow can help a menu or dialog separate from the canvas. A faint accent tint or gradient can add depth to a selected surface or dashboard header. Keep these treatments local so they do not compete with editor content.

## Color

Use neutral backgrounds and readable text, with color carrying state and brand identity. The primary accent is Discord blurple (`#5865f2`). Keep it consistent across focus rings, active tabs, links, selected rows, and primary actions.

- Dark theme: use Discord charcoal surfaces (`#313338`, `#2b2d31`, `#1e1f22`) with readable soft-white text.
- Light theme: keep the same blurple accent with neutral gray surfaces and dark text.
- Use green, amber, and red for success, warnings, and errors.
- Keep selection washes translucent so code and terminal output remain legible.
- Keep light and dark token sets paired; do not add a one-off color when a semantic token fits.

All color values should come from CSS custom properties in `assets/styles.css` where practical. Prefer semantic tokens over repeating raw color values in component rules.

## Typography and icons

Use the system UI stack for app chrome and the monospace stack for code, terminal output, paths, and keyboard keys. Headings can be larger than pane labels, but should not overpower the workspace. Secondary text must remain readable at normal window sizes.

Use one consistent SVG icon style with aligned stroke weight and optical size. Avoid emoji as interface icons. Give icon-only controls an accessible label and a useful tooltip.

## Interaction and motion

Controls should respond clearly to hover, focus, pressed, selected, and disabled states. Pane and workspace switching must be immediate, without transition animation. Other controls may use a brief color change where it helps communicate interaction.

- Avoid movement on repeated workbench controls. Use small state color changes instead.
- Keep motion off pane and workspace changes so input feels immediate.
- Avoid animation that delays input or distracts while reading terminal and editor content.
- Respect `prefers-reduced-motion` for nonessential transitions.
- Keep keyboard focus visible; do not rely on color alone to identify the active pane or control.

## Accessibility and responsive behavior

Maintain readable contrast in both themes, visible focus indicators, clear hit targets, and meaningful names for controls. When the window narrows, wrap or scroll secondary content before shrinking text or hiding essential actions.

## Design tokens

The current renderer tokens live in `apps/workspace/src/renderer/src/assets/styles.css`:

| Token | Role |
| --- | --- |
| `--bg-base`, `--bg-surface`, `--bg-raised`, `--bg-hover`, `--bg-active` | Workspace and component surfaces |
| `--border`, `--border-subtle`, `--border-strong` | Structural separators |
| `--text`, `--text-muted`, `--text-faint` | Text hierarchy |
| `--accent` | Primary brand and interaction color |
| `--radius-sm`, `--radius-md`, `--radius-lg` | Shared corner geometry |
| `--shadow-overlay` | Menus and dialogs |
| `--motion-fast`, `--motion-hover-delay` | Shared interaction timing |
| `--scroll-size`, `--scroll-thumb`, `--scroll-thumb-hover` | Scrollbar treatment |
| `--font-ui`, `--font-mono` | Interface and technical text |

Use these guidelines as defaults, not prohibitions. A visual treatment is welcome when it improves clarity, feedback, or identity and remains consistent with the desktop workbench.
