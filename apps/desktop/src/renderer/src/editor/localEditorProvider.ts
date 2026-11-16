import type {
  EditorItemRef,
  EditorProvider,
  EditorProviderCapabilities,
  EditorReplaceOptions,
  EditorSearchResult,
  EditorTreeItem
} from '@workspace/editor'
import { EditorProviderError, withEditorProviderErrors } from '@workspace/editor'
import {
  cancelSearch,
  createDir,
  deletePath,
  listDir,
  onFileChanged,
  onSearchDone,
  onSearchResult,
  readFile,
  renamePath,
  searchInFiles,
  writeFile,
  writeFileIfUnchanged,
  type SearchFileResult
} from '../electron'
import { LocalDocumentSession } from './localDocumentSession'

type QuickOpenWorkerResponse = { requestId: number; paths: string[] }
type PendingQuickOpenSearch = {
  resolve: (paths: string[]) => void
  reject: (error: Error) => void
  signal?: AbortSignal
  abort?: () => void
}

const filePathsCache = new Map<string, Promise<string[]>>()
const filePathRevisions = new Map<string, number>()
const workerIndexedTabs = new Set<string>()
const workerTabIds = new Map<string, number>()
let nextWorkerTabId = 0
const pendingQuickOpenSearches = new Map<number, PendingQuickOpenSearch>()
let quickOpenWorker: Worker | null = null
let nextQuickOpenRequestId = 0

function getQuickOpenWorker(): Worker {
  if (quickOpenWorker) return quickOpenWorker
  const worker = new Worker(new URL('./quickOpenSearch.worker.ts', import.meta.url), {
    type: 'module'
  })
  worker.addEventListener('message', (event: MessageEvent<QuickOpenWorkerResponse>) => {
    const pending = pendingQuickOpenSearches.get(event.data.requestId)
    if (!pending) return
    pendingQuickOpenSearches.delete(event.data.requestId)
    if (pending.abort) pending.signal?.removeEventListener('abort', pending.abort)
    pending.resolve(event.data.paths)
  })
  worker.addEventListener('error', (event) => {
    for (const [requestId, pending] of pendingQuickOpenSearches) {
      if (pending.abort) pending.signal?.removeEventListener('abort', pending.abort)
      pending.reject(new Error(event.message || 'Quick Open search worker failed'))
      pendingQuickOpenSearches.delete(requestId)
    }
    quickOpenWorker = null
    workerIndexedTabs.clear()
  })
  quickOpenWorker = worker
  return worker
}

function providerScope(tabId: number, rootPath: string): string {
  return JSON.stringify([tabId, rootPath])
}

function workerTabIdFor(scope: string): number {
  let id = workerTabIds.get(scope)
  if (id === undefined) {
    id = ++nextWorkerTabId
    workerTabIds.set(scope, id)
  }
  return id
}

function invalidateQuickOpenFileList(tabId: number, rootPath: string): void {
  const scope = providerScope(tabId, rootPath)
  filePathsCache.delete(scope)
  filePathRevisions.set(scope, (filePathRevisions.get(scope) ?? 0) + 1)
  workerIndexedTabs.delete(scope)
  quickOpenWorker?.postMessage({ type: 'remove-files', tabId: workerTabIdFor(scope) })
}

async function searchQuickOpenPaths(
  tabId: number,
  rootPath: string,
  query: string,
  limit: number,
  signal?: AbortSignal
): Promise<string[]> {
  abortIfNeeded(signal)
  const scope = providerScope(tabId, rootPath)
  const workerTabId = workerTabIdFor(scope)
  const filePathRevision = filePathRevisions.get(scope) ?? 0
  let pathsPromise = filePathsCache.get(scope)
  if (!pathsPromise) {
    pathsPromise = window.api.fs.listAllFiles(tabId, rootPath)
    filePathsCache.set(scope, pathsPromise)
    void pathsPromise.catch(() => {
      if (filePathsCache.get(scope) === pathsPromise) filePathsCache.delete(scope)
    })
  }
  const paths = await pathsPromise
  abortIfNeeded(signal)
  if (filePathRevision !== (filePathRevisions.get(scope) ?? 0)) {
    return searchQuickOpenPaths(tabId, rootPath, query, limit, signal)
  }
  const worker = getQuickOpenWorker()
  if (!workerIndexedTabs.has(scope)) {
    worker.postMessage({ type: 'set-files', tabId: workerTabId, paths })
    workerIndexedTabs.add(scope)
  }

  const requestId = ++nextQuickOpenRequestId
  return new Promise<string[]>((resolve, reject) => {
    const pending: PendingQuickOpenSearch = { resolve, reject, signal }
    pending.abort = () => {
      pendingQuickOpenSearches.delete(requestId)
      reject(new DOMException('The operation was aborted', 'AbortError'))
    }
    pendingQuickOpenSearches.set(requestId, pending)
    if (signal?.aborted) {
      pending.abort()
      return
    }
    signal?.addEventListener('abort', pending.abort, { once: true })
    worker.postMessage({ type: 'search', requestId, tabId: workerTabId, query, limit })
  })
}

const capabilities: EditorProviderCapabilities = {
  operations: new Set(['createFile', 'createDirectory', 'rename', 'move', 'delete']),
  searchNames: true,
  searchContents: true,
  replaceContents: true,
  multiSelect: true,
  dragMove: true,
  codeLanguages: new Set(['*']),
  collaborativeDocuments: false
}

function findMatch(
  text: string,
  query: string,
  options: { caseSensitive: boolean; regex: boolean; wholeWord: boolean }
): number {
  if (!query) return -1
  const flags = options.caseSensitive ? 'gu' : 'giu'
  const matcher = options.regex
    ? new RegExp(query, flags)
    : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags)
  let match: RegExpExecArray | null
  while ((match = matcher.exec(text))) {
    const before = text[match.index - 1] ?? ''
    const after = text[match.index + match[0].length] ?? ''
    const word = /[\p{L}\p{N}_]/u
    if (!options.wholeWord || (!word.test(before) && !word.test(after))) return match.index
    if (!match[0].length) matcher.lastIndex++
  }
  return -1
}

function replaceRegex(query: string, options: EditorReplaceOptions): RegExp {
  const source = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const bounded = options.wholeWord ? `\\b(?:${source})\\b` : source
  return new RegExp(bounded, `g${options.caseSensitive ? '' : 'i'}`)
}

type LocalEditorProvider = Omit<EditorProvider, 'create' | 'rename' | 'delete' | 'move'> &
  Required<Pick<EditorProvider, 'create' | 'rename' | 'delete' | 'move'>> & {
    dispose: () => void
    pathForItemId: (itemId: string) => string | null
  }

function kindFor(path: string, directory: boolean): EditorTreeItem['kind'] {
  if (directory) return 'directory'
  const extension = path.split('.').at(-1)?.toLowerCase()
  if (['md', 'markdown', 'mdown'].includes(extension ?? '')) return 'markdown'
  if (
    [
      'png',
      'jpg',
      'jpeg',
      'gif',
      'webp',
      'svg',
      'pdf',
      'zip',
      '7z',
      'glb',
      'gltf',
      'stl',
      'step',
      'stp',
      'epub'
    ].includes(extension ?? '')
  )
    return 'asset'
  return 'code'
}

function parentOf(path: string): string | null {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? '' : path.slice(0, slash)
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
}

/** Workspace filesystem adapter. Electron IPC remains behind the renderer shim. */
function buildLocalEditorProvider(tabId: number, rootPath: string): LocalEditorProvider {
  const id = `workspace:${tabId}:${rootPath}`
  const pathByItemId = new Map<string, string>()
  const itemIdByPath = new Map<string, string>()
  const itemIdStorageKey = `workspace:editor-item-ids:${tabId}:${rootPath}`
  try {
    const saved = JSON.parse(localStorage.getItem(itemIdStorageKey) ?? '{}') as Record<
      string,
      unknown
    >
    for (const [path, value] of Object.entries(saved)) {
      if (typeof value !== 'string' || value.length === 0) continue
      const itemId = value.startsWith(`${id}:item:`) ? value : `${id}:item:${value}`
      if (pathByItemId.has(itemId)) continue
      itemIdByPath.set(path, itemId)
      pathByItemId.set(itemId, path)
    }
  } catch {
    // A corrupt or unavailable identity cache must not prevent the Editor tree from opening.
  }
  const persistItemIds = () => {
    try {
      localStorage.setItem(itemIdStorageKey, JSON.stringify(Object.fromEntries(itemIdByPath)))
    } catch {
      // Storage quota/private mode can disable persistence; current provider IDs remain valid in memory.
    }
  }
  const listeners = new Set<(parents: readonly (string | null)[]) => void>()
  const sessions = new Set<LocalDocumentSession>()

  const itemFor = (
    path: string,
    directory: boolean,
    name = path.split('/').at(-1) ?? ''
  ): EditorTreeItem => {
    let itemId = itemIdByPath.get(path)
    if (!itemId) {
      itemId = `${id}:item:${crypto.randomUUID()}`
      itemIdByPath.set(path, itemId)
      pathByItemId.set(itemId, path)
    }
    const parentPath = parentOf(path)
    const parentId = parentPath
      ? (itemIdByPath.get(parentPath) ?? itemFor(parentPath, true).itemId)
      : null
    return {
      providerId: id,
      itemId,
      parentId,
      name,
      path,
      kind: kindFor(path, directory),
      readOnly: false
    }
  }
  const parentItemId = (path: string): string | null => {
    const parentPath = parentOf(path)
    return parentPath ? itemFor(parentPath, true).itemId : null
  }

  const unsubscribeFiles = onFileChanged((changedPaths) => {
    invalidateQuickOpenFileList(tabId, rootPath)
    if (changedPaths.length === 0 || changedPaths.every((path) => !path)) {
      for (const session of sessions) session.externalChange([session.item.path])
      for (const listener of listeners) listener([null])
      return
    }
    const parentPaths = [...new Set(changedPaths.map(parentOf))]
    const parents = [
      ...new Set(parentPaths.map((path) => (path ? itemFor(path, true).itemId : null)))
    ]
    for (const session of sessions) session.externalChange(changedPaths)
    if (parents.length) for (const listener of listeners) listener(parents)
  })

  const provider: LocalEditorProvider = {
    id,
    capabilities,
    async listChildren(parentId, signal) {
      abortIfNeeded(signal)
      const parentPath = parentId === null ? '' : pathByItemId.get(parentId)
      if (parentPath === undefined) return []
      const entries = await listDir(tabId, parentPath, rootPath)
      abortIfNeeded(signal)
      const items = entries.map((entry) => ({
        ...itemFor(entry.path, entry.is_dir, entry.name),
        isIgnored: entry.is_ignored
      }))
      persistItemIds()
      return items
    },
    pathForItemId(itemId) {
      return pathByItemId.get(itemId) ?? null
    },
    subscribeTree(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async openDocument(ref: EditorItemRef, signal) {
      abortIfNeeded(signal)
      if (ref.providerId !== id)
        throw new EditorProviderError('notFound', 'Document belongs to a different provider')
      const path = pathByItemId.get(ref.itemId)
      if (path === undefined) throw new EditorProviderError('notFound', 'Document no longer exists')
      const item = itemFor(path, false)
      const session = new LocalDocumentSession(
        item,
        tabId,
        rootPath,
        () => sessions.delete(session),
        kindFor
      )
      sessions.add(session)
      try {
        await session.load()
        abortIfNeeded(signal)
        return session
      } catch (error) {
        await session.close().catch(() => {})
        throw error
      }
    },
    async search(query, options, signal, onResult) {
      if (options.target === 'names') {
        const paths = options.fuzzy
          ? await searchQuickOpenPaths(tabId, rootPath, query, options.limit ?? 100, signal)
          : (await window.api.fs.listAllFiles(tabId, rootPath)).filter(
              (path) => findMatch(path.split('/').at(-1) ?? '', query, options) >= 0
            )
        abortIfNeeded(signal)
        const results = paths.map((path) => ({ item: itemFor(path, false) }))
        for (const result of results) {
          abortIfNeeded(signal)
          onResult?.(result)
        }
        persistItemIds()
        return results
      }
      if (!query) return []
      const toEditorResult = (file: SearchFileResult): EditorSearchResult => ({
        item: itemFor(file.path, false),
        matches: file.matches.map((match) => ({
          line: match.lineNumber,
          column: match.ranges[0]?.start + 1 || 1,
          preview: match.lineText,
          ranges: match.ranges
        }))
      })
      return new Promise<EditorSearchResult[]>((resolve, reject) => {
        const requestId = crypto.randomUUID()
        const files = new Map<string, SearchFileResult>()
        let settled = false
        const cleanup = () => {
          offResult()
          offDone()
          signal?.removeEventListener('abort', abort)
        }
        const finish = (error?: unknown) => {
          if (settled) return
          settled = true
          cleanup()
          if (error) {
            reject(error instanceof Error ? error : new Error(String(error)))
            return
          }
          const results = [...files.values()].map(toEditorResult)
          persistItemIds()
          resolve(results)
        }
        const abort = () => {
          cancelSearch(requestId)
          finish(new DOMException('The operation was aborted', 'AbortError'))
        }
        const offResult = onSearchResult((id, result) => {
          if (id !== requestId) return
          files.set(result.path, result)
          onResult?.(toEditorResult(result))
        })
        const offDone = onSearchDone((id, error) => {
          if (id === requestId) finish(error ? new Error(error) : undefined)
        })
        if (signal?.aborted) {
          abort()
          return
        }
        signal?.addEventListener('abort', abort, { once: true })
        try {
          searchInFiles(
            requestId,
            tabId,
            query,
            {
              caseSensitive: options.caseSensitive,
              regex: options.regex,
              wholeWord: options.wholeWord
            },
            rootPath
          )
        } catch (error) {
          settled = true
          cleanup()
          reject(error)
        }
      })
    },
    async replaceContents(ref, query, replacement, options, expectedMatchCount) {
      if (ref.providerId !== id)
        throw new EditorProviderError('notFound', 'Item belongs to a different provider')
      const path = pathByItemId.get(ref.itemId)
      if (path === undefined) throw new EditorProviderError('notFound', 'Item no longer exists')
      const openSession = [...sessions].find((session) => session.item.itemId === ref.itemId)
      if (openSession && openSession.snapshot().savePhase !== 'clean') return false
      const current = await readFile(tabId, path, rootPath)
      if (current == null) return false
      const matcher = replaceRegex(query, options)
      const currentCount = [...current.matchAll(matcher)].length
      if (currentCount !== expectedMatchCount) return false
      const next = current.replace(matcher, replacement)
      if (next !== current && !(await writeFileIfUnchanged(tabId, path, current, next, rootPath)))
        return false
      return true
    },
    async create(parentId, kind, name) {
      const parentPath = parentId === null ? '' : pathByItemId.get(parentId)
      if (parentPath === undefined)
        throw new EditorProviderError('notFound', 'Parent directory no longer exists')
      const path = [parentPath, name].filter(Boolean).join('/')
      if (kind === 'directory') await createDir(tabId, path, rootPath)
      else await writeFile(tabId, path, '', rootPath)
      invalidateQuickOpenFileList(tabId, rootPath)
      const item = itemFor(path, kind === 'directory', name)
      persistItemIds()
      return item
    },
    async rename(ref, name) {
      if (ref.providerId !== id)
        throw new EditorProviderError('notFound', 'Item belongs to a different provider')
      const from = pathByItemId.get(ref.itemId)
      if (from === undefined) throw new EditorProviderError('notFound', 'Item no longer exists')
      const oldEntries = await listDir(tabId, parentOf(from) ?? '', rootPath)
      const isDirectory = oldEntries.find((entry) => entry.path === from)?.is_dir ?? false
      const to = [parentOf(from) ?? '', name].filter(Boolean).join('/')
      await renamePath(tabId, from, to, rootPath)
      invalidateQuickOpenFileList(tabId, rootPath)
      const affected = [...pathByItemId.entries()].filter(
        ([, path]) => path === from || (isDirectory && path.startsWith(`${from}/`))
      )
      for (const [itemId, oldPath] of affected) {
        const nextPath = `${to}${oldPath.slice(from.length)}`
        itemIdByPath.delete(oldPath)
        itemIdByPath.set(nextPath, itemId)
        pathByItemId.set(itemId, nextPath)
        for (const session of sessions)
          session.renamePath(
            oldPath,
            nextPath,
            nextPath.split('/').at(-1) ?? '',
            parentItemId(nextPath)
          )
      }
      persistItemIds()
      for (const listener of listeners)
        listener([...new Set([parentItemId(from), parentItemId(to)])])
      return itemFor(to, isDirectory, name)
    },
    async delete(refs) {
      const paths = refs.map((ref) => {
        if (ref.providerId !== id)
          throw new EditorProviderError('notFound', 'Item belongs to a different provider')
        const path = pathByItemId.get(ref.itemId)
        if (path === undefined) throw new EditorProviderError('notFound', 'Item no longer exists')
        return path
      })
      // Validate all identities before the first filesystem mutation so a stale
      // selection cannot produce a partially deleted batch.
      for (const path of paths) {
        const parentEntries = await listDir(tabId, parentOf(path) ?? '', rootPath)
        if (!parentEntries.some((entry) => entry.path === path)) {
          throw new EditorProviderError('notFound', 'Item no longer exists')
        }
      }
      const roots = paths.filter(
        (path) => !paths.some((candidate) => candidate !== path && path.startsWith(`${candidate}/`))
      )
      for (const path of roots) {
        await deletePath(tabId, path, rootPath)
        const affected = [...pathByItemId.entries()].filter(
          ([, candidate]) => candidate === path || candidate.startsWith(`${path}/`)
        )
        for (const [itemId, candidate] of affected) {
          pathByItemId.delete(itemId)
          itemIdByPath.delete(candidate)
        }
      }
      invalidateQuickOpenFileList(tabId, rootPath)
      persistItemIds()
    },
    async move(refs, parentId) {
      const targetDir = parentId === null ? '' : pathByItemId.get(parentId)
      if (targetDir === undefined)
        throw new EditorProviderError('notFound', 'Destination directory no longer exists')
      if (targetDir) {
        const targetParentEntries = await listDir(tabId, parentOf(targetDir) ?? '', rootPath)
        if (!targetParentEntries.some((entry) => entry.path === targetDir && entry.is_dir)) {
          throw new EditorProviderError('notFound', 'Destination directory no longer exists')
        }
      }
      const sources = refs.map((ref) => {
        if (ref.providerId !== id)
          throw new EditorProviderError('notFound', 'Item belongs to a different provider')
        const from = pathByItemId.get(ref.itemId)
        if (from === undefined) throw new EditorProviderError('notFound', 'Item no longer exists')
        return from
      })
      for (const from of sources) {
        const oldEntries = await listDir(tabId, parentOf(from) ?? '', rootPath)
        const sourceEntry = oldEntries.find((entry) => entry.path === from)
        if (!sourceEntry) throw new EditorProviderError('notFound', 'Item no longer exists')
      }
      const roots = sources.filter(
        (path) =>
          !sources.some((candidate) => candidate !== path && path.startsWith(`${candidate}/`))
      )
      for (const from of roots) {
        const name = from.split('/').at(-1) ?? from
        const to = [targetDir, name].filter(Boolean).join('/')
        if (from === to || to.startsWith(`${from}/`)) continue
        const oldEntries = await listDir(tabId, parentOf(from) ?? '', rootPath)
        const isDirectory = oldEntries.find((entry) => entry.path === from)?.is_dir ?? false
        await renamePath(tabId, from, to, rootPath)
        invalidateQuickOpenFileList(tabId, rootPath)
        const affected = [...pathByItemId.entries()].filter(
          ([, path]) => path === from || path.startsWith(`${from}/`)
        )
        for (const [itemId, oldPath] of affected) {
          const nextPath = `${to}${oldPath.slice(from.length)}`
          itemIdByPath.delete(oldPath)
          itemIdByPath.set(nextPath, itemId)
          pathByItemId.set(itemId, nextPath)
          for (const session of sessions)
            session.renamePath(
              oldPath,
              nextPath,
              nextPath.split('/').at(-1) ?? '',
              parentItemId(nextPath)
            )
        }
        persistItemIds()
        for (const listener of listeners)
          listener([...new Set([parentItemId(from), parentItemId(to)])])
        // Resolve the moved root again to retain the directory kind in its metadata.
        itemFor(to, isDirectory, name)
      }
    },
    dispose() {
      invalidateQuickOpenFileList(tabId, rootPath)
      unsubscribeFiles()
      listeners.clear()
      for (const session of [...sessions]) void session.close()
    }
  }

  // The owner controls provider lifetime; dispose stops the file watcher.
  return withEditorProviderErrors(provider)
}

const providerPool = new Map<string, { provider: LocalEditorProvider; references: number }>()

/** Share one provider identity across the Editor tree and document panes for a workspace tab. */
export function acquireLocalEditorProvider(
  tabId: number,
  rootPath: string
): {
  provider: LocalEditorProvider
  release: () => void
} {
  const key = JSON.stringify([tabId, rootPath])
  let entry = providerPool.get(key)
  if (!entry) {
    entry = { provider: buildLocalEditorProvider(tabId, rootPath), references: 0 }
    providerPool.set(key, entry)
  }
  entry.references++
  let released = false
  return {
    provider: entry.provider,
    release: () => {
      if (released) return
      released = true
      const current = providerPool.get(key)
      if (!current || current !== entry) return
      current.references--
      if (current.references <= 0) {
        providerPool.delete(key)
        current.provider.dispose()
      }
    }
  }
}
