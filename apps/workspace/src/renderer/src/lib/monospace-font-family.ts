// Port of ref-proj/orca/src/renderer/src/lib/monospace-font-family.ts
const FALLBACK_FONTS = [
  "SF Mono",
  "Menlo",
  "Monaco",
  "Cascadia Mono",
  "Consolas",
  "D2Coding",
  "NanumGothicCoding",
  "Noto Sans Mono CJK KR",
  "Apple SD Gothic Neo",
  "Malgun Gothic",
  "DejaVu Sans Mono",
  "Liberation Mono",
  "Workspace Nerd Font Symbols",
  "Symbols Nerd Font Mono",
  "MesloLGS Nerd Font",
  "JetBrainsMono Nerd Font",
  "Hack Nerd Font",
  "monospace",
] as const;

export function buildTerminalFontFamily(fontFamily?: string): string {
  const trimmed = fontFamily?.trim() ?? "";
  const parts = trimmed ? [`"${trimmed}"`] : [];
  const lowerParts = parts.map((p) => p.toLowerCase());
  for (const fallback of FALLBACK_FONTS) {
    const lower = fallback.toLowerCase();
    if (!lowerParts.some((p) => p.includes(lower))) {
      parts.push(fallback === "monospace" ? fallback : `"${fallback}"`);
    }
  }
  return parts.join(", ");
}
