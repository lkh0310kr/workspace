/** Unfocused split panes dim to this opacity (Orca uses ~0.95; we use 0.78 per UX). */
export const PANE_GROUP_UNFOCUSED_OPACITY = 0.78

export function paneGroupHostClassNames(options: {
  hasSplitGroups: boolean
  isFocused: boolean
}): string {
  const classes = ['pane-group-host']
  if (!options.hasSplitGroups) return classes.join(' ')
  if (options.isFocused) classes.push('pane-group-host-focused')
  else classes.push('pane-group-host-unfocused')
  return classes.join(' ')
}

export function resolvePaneGroupTabSetId(parent: { getType(): string; getId(): string } | undefined): string | undefined {
  if (!parent || parent.getType() !== 'tabset') return undefined
  return parent.getId()
}
