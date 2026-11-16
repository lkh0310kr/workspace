type StartServer = () => Promise<number>

type WorkspaceFactory<T> = (getStatusUrl: () => string | null) => T

export async function createWorkspaceAfterAgentHookServer<T>(
  startServer: StartServer,
  createWorkspace: WorkspaceFactory<T>,
  onStarted: (port: number) => void,
  onStartFailed: (error: unknown) => void
): Promise<T> {
  let port: number | null = null
  try {
    port = await startServer()
    onStarted(port)
  } catch (error) {
    onStartFailed(error)
  }

  return createWorkspace(() => (port === null ? null : `http://127.0.0.1:${port}/status`))
}
