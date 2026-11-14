/** Resolve a relative Markdown target against a provider path without touching the host filesystem. */
export function resolveEditorRelativeLink(currentPath: string, target: string): string | null {
  const pathPart = target.split(/[?#]/, 1)[0]
  if (!pathPart || pathPart.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(pathPart)) return null
  let decoded: string[]
  try {
    decoded = pathPart.split('/').map((part) => decodeURIComponent(part))
  } catch {
    return null
  }
  const segments = pathPart.startsWith('/')
    ? []
    : currentPath.split('/').slice(0, -1).filter(Boolean)
  for (const part of decoded) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!segments.length) return null
      segments.pop()
    } else {
      segments.push(part)
    }
  }
  return segments.join('/') || null
}
