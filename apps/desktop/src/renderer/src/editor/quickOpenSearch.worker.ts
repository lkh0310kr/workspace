import { fuzzyEditorSearch } from '@workspace/editor/fuzzySearch'

type WorkerRequest =
  | { type: 'set-files'; tabId: number; paths: string[] }
  | { type: 'remove-files'; tabId: number }
  | { type: 'search'; requestId: number; tabId: number; query: string; limit: number }

type WorkerResponse = { requestId: number; paths: string[] }

const workerScope = globalThis as unknown as {
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<WorkerRequest>) => void
  ) => void
  postMessage: (message: WorkerResponse) => void
}
const pathsByTab = new Map<number, string[]>()

workerScope.addEventListener('message', ({ data }) => {
  if (data.type === 'set-files') {
    pathsByTab.set(data.tabId, data.paths)
    return
  }
  if (data.type === 'remove-files') {
    pathsByTab.delete(data.tabId)
    return
  }
  const paths = pathsByTab.get(data.tabId) ?? []
  workerScope.postMessage({
    requestId: data.requestId,
    paths: fuzzyEditorSearch(paths, data.query, (path) => path, data.limit)
  })
})
