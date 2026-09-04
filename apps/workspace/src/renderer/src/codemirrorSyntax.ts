import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// Colors via CSS custom properties (styles.css) rather than literal hex
// values baked into the HighlightStyle, so syntax coloring stays in sync
// with light/dark theme switching the same way the rest of the app's
// theming already does. The palette itself mirrors VS Code's own
// default dark/light themes (a well-known, broadly legible reference
// point) rather than invented colors.
const syntaxColors = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: "var(--syntax-keyword)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--syntax-string)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--syntax-number)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--syntax-function)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--syntax-type)" },
  { tag: t.propertyName, color: "var(--syntax-property)" },
  { tag: [t.definition(t.variableName), t.variableName], color: "var(--text)" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "var(--text-muted)" },
  { tag: t.tagName, color: "var(--syntax-keyword)" },
  { tag: t.attributeName, color: "var(--syntax-function)" },
  { tag: t.invalid, color: "var(--syntax-invalid)" },
]);

export const syntaxTheme = syntaxHighlighting(syntaxColors);
