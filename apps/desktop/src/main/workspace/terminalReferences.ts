import { extractTerminalIds } from './layout'

/** Find removed terminal ids that no remaining Workspace layout references. */
export function findUnreferencedTerminalIds(
  candidateIds: Iterable<number>,
  remainingLayouts: Iterable<string>
): number[] {
  const stillReferenced = new Set<number>()
  for (const layout of remainingLayouts) {
    for (const id of extractTerminalIds(layout)) {
      stillReferenced.add(id)
    }
  }

  return [...new Set(candidateIds)].filter((id) => !stillReferenced.has(id))
}
