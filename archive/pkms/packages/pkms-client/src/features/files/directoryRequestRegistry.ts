/** Coalesces duplicate directory reads without mixing workspace identities. */
export class DirectoryRequestRegistry {
  private readonly requests = new Map<string, Promise<unknown>>()

  run<T>(workspaceId: string, directory: string, load: () => Promise<T>): Promise<T> {
    const key = JSON.stringify([workspaceId, directory])
    const existing = this.requests.get(key)
    if (existing) return existing as Promise<T>

    const request = load().finally(() => {
      if (this.requests.get(key) === request) this.requests.delete(key)
    })
    this.requests.set(key, request)
    return request
  }
}
