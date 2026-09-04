// Orca parity — tab-group/tab-group-body-anchor.ts
// Browser/terminal overlays position against the pane group body via CSS anchor-name.

const ANCHOR_PREFIX = "--workspace-pane-group-body-";

export function paneGroupBodyAnchorName(paneNodeId: string): string {
  const encoded = Array.from(paneNodeId, (char) => char.codePointAt(0)?.toString(16) ?? "").join(
    "-",
  );
  return `${ANCHOR_PREFIX}${encoded || "empty"}`;
}
