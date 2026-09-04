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

### Sharp, Rectangular UI

**Rounded corners are forbidden.**

Use a strict rectangular visual language.

```css
border-radius: 0;
```

Do not use:

* Rounded containers
* Pill-shaped elements
* Soft corners
* Excessive geometric decoration

The interface should feel crisp and precise.

---

## Depth

### No Shadows

**Shadows are forbidden.**

```css
box-shadow: none;
```

Do not use shadows to create:

* Elevation
* Floating surfaces
* Hierarchy
* Depth
* Modal emphasis

The interface should remain visually flat.

Hierarchy should come from **contrast, borders, typography, and position**.

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

Motion should be minimal.

Animations should exist only when they improve:

* Spatial understanding
* State transitions
* Orientation
* Feedback

Avoid motion used purely for visual flair.

The application should feel fast and responsive rather than animated.

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
| `--font-ui` | UI chrome |
| `--font-mono` | Editor, terminal |
| `--scroll-size` / `--scroll-thumb` | Unified scrollbars (`.scroll-region`) |
| `.ui-btn` | Shared button chrome |
