type RendererFocusReturnHandler = () => boolean

const handlers = new Set<RendererFocusReturnHandler>()

export function registerRendererFocusReturnHandler(
  handler: RendererFocusReturnHandler
): () => void {
  handlers.add(handler)
  return () => handlers.delete(handler)
}

/** Return focus to the renderer before an embedded native surface is hidden. */
export function returnRendererFocusBeforeSurfaceHidden(): void {
  for (const handler of handlers) {
    if (handler()) return
  }
}
