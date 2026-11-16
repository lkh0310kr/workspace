export type KeyboardSurface = 'browser' | 'terminal'
type KeyboardSurfaceRelease = (reason: string) => void

type ReleaseRegistration = {
  releasedBy: ReadonlySet<KeyboardSurface>
  release: KeyboardSurfaceRelease
}

const releaseRegistrations = new Map<KeyboardSurface, ReleaseRegistration>()

/** Register a host surface's release behavior without importing sibling surfaces. */
export function registerKeyboardSurfaceRelease(
  surface: KeyboardSurface,
  releasedBy: readonly KeyboardSurface[],
  release: KeyboardSurfaceRelease
): () => void {
  const registration = { releasedBy: new Set(releasedBy), release }
  releaseRegistrations.set(surface, registration)
  return () => {
    if (releaseRegistrations.get(surface) === registration) releaseRegistrations.delete(surface)
  }
}

/** Transfer keyboard ownership while keeping each embedded feature behind its host contract. */
export function requestKeyboardSurface(surface: KeyboardSurface, reason: string): void {
  for (const [registeredSurface, registration] of releaseRegistrations) {
    if (registeredSurface !== surface && registration.releasedBy.has(surface)) {
      registration.release(reason)
    }
  }
}
