export type EditorItemKind = 'directory' | 'markdown' | 'code' | 'asset'
export type EditorOperation = 'createFile' | 'createDirectory' | 'rename' | 'move' | 'delete'
export type EditorSavePhase = 'clean' | 'dirty' | 'saving' | 'conflict' | 'error'
export type EditorSyncPhase = 'idle' | 'pending' | 'synced' | 'blocked'
export type EditorProviderErrorCode =
  'notFound' | 'readOnly' | 'conflict' | 'offline' | 'unauthorized' | 'unsupported' | 'unknown'

/** A user-safe provider failure with a stable code for shared editor behavior. */
export class EditorProviderError extends Error {
  readonly code: EditorProviderErrorCode

  constructor(code: EditorProviderErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'EditorProviderError'
    this.code = code
  }
}

export function isEditorProviderError(error: unknown): error is EditorProviderError {
  return error instanceof EditorProviderError
}

export function isEditorAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  )
}

const providerOperationMessages: Readonly<Record<string, string>> = {
  listChildren: 'Could not load this folder.',
  subscribeTree: 'Could not monitor this file tree.',
  openDocument: 'Could not open this document.',
  search: 'Could not search files.',
  replaceContents: 'Could not replace file contents.',
  create: 'Could not create this item.',
  rename: 'Could not rename this item.',
  move: 'Could not move this item.',
  delete: 'Could not delete this item.',
  replaceText: 'Could not update this document.',
  save: 'Could not save this document.',
  close: 'Could not close this document cleanly.'
}

function normalizeProviderError(error: unknown, operation: string): Error {
  if (error instanceof EditorProviderError) return error
  if (isEditorAbortError(error)) return error as Error
  return new EditorProviderError(
    'unknown',
    providerOperationMessages[operation] ?? 'The editor operation failed.',
    { cause: error }
  )
}

function wrapSessionErrors(session: EditorDocumentSession): EditorDocumentSession {
  const asyncMethods = new Set(['replaceText', 'save', 'close'])
  return new Proxy(session, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown
      if (
        typeof property !== 'string' ||
        !asyncMethods.has(property) ||
        typeof value !== 'function'
      )
        return value
      return async (...args: unknown[]) => {
        try {
          return await Reflect.apply(value, target, args)
        } catch (error) {
          throw normalizeProviderError(error, property)
        }
      }
    }
  })
}

/** Normalize unclassified provider failures while preserving typed and cancelled operations. */
export function withEditorProviderErrors<T extends EditorProvider>(provider: T): T {
  const asyncMethods = new Set([
    'listChildren',
    'openDocument',
    'search',
    'replaceContents',
    'create',
    'rename',
    'move',
    'delete'
  ])
  return new Proxy(provider, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown
      if (property === 'subscribeTree' && typeof value === 'function') {
        return (...args: unknown[]) => {
          try {
            return Reflect.apply(value, target, args)
          } catch (error) {
            throw normalizeProviderError(error, property)
          }
        }
      }
      if (
        typeof property !== 'string' ||
        !asyncMethods.has(property) ||
        typeof value !== 'function'
      )
        return value
      return async (...args: unknown[]) => {
        try {
          const result: unknown = await Reflect.apply(value, target, args)
          return property === 'openDocument'
            ? wrapSessionErrors(result as EditorDocumentSession)
            : result
        } catch (error) {
          throw normalizeProviderError(error, property)
        }
      }
    }
  })
}

export interface EditorItemRef {
  /** Stable ID of a provider instance, such as one local workspace or PKMS vault. */
  providerId: string
  /** Stable within the provider across rename and move operations. */
  itemId: string
}

export interface EditorTreeItem extends EditorItemRef {
  parentId: string | null
  name: string
  path: string
  kind: EditorItemKind
  readOnly: boolean
  isIgnored?: boolean
}

export interface EditorProviderCapabilities {
  operations: ReadonlySet<EditorOperation>
  searchNames: boolean
  searchContents: boolean
  replaceContents: boolean
  multiSelect: boolean
  dragMove: boolean
  codeLanguages: ReadonlySet<string>
  collaborativeDocuments: boolean
}

export interface EditorSearchOptions {
  target: 'names' | 'contents'
  caseSensitive: boolean
  regex: boolean
  wholeWord: boolean
  /** Rank name candidates by fuzzy subsequence score for Quick Open. */
  fuzzy?: boolean
  /** Maximum number of name candidates to return. */
  limit?: number
}

export interface EditorSearchResult {
  item: EditorTreeItem
  line?: number
  column?: number
  preview?: string
  matches?: readonly EditorSearchMatch[]
}

export interface EditorSearchPage {
  results: EditorSearchResult[]
  nextCursor: string | null
  hasMore: boolean
}

export interface EditorSearchMatch {
  line: number
  column: number
  preview: string
  /** UTF-16 string offsets, suitable for CodeMirror and DOM string slicing. */
  ranges: readonly { start: number; end: number }[]
}

export interface EditorReplaceOptions {
  caseSensitive: boolean
  regex: boolean
  wholeWord: boolean
}

export interface EditorProvider {
  /** Stable for a mounted source and persisted editor state. */
  readonly id: string
  readonly capabilities: EditorProviderCapabilities
  listChildren(parentId: string | null, signal?: AbortSignal): Promise<EditorTreeItem[]>
  /** Invalidate affected parent IDs; the shared editor reloads only those branches. */
  /** `null` identifies the provider root. */
  subscribeTree(listener: (changedParentIds: readonly (string | null)[]) => void): () => void
  openDocument(item: EditorItemRef, signal?: AbortSignal): Promise<EditorDocumentSession>
  search(
    query: string,
    options: EditorSearchOptions,
    signal?: AbortSignal,
    onResult?: (result: EditorSearchResult) => void
  ): Promise<EditorSearchResult[]>
  /** Optional cursor paging for providers whose content search has a bounded response size. */
  searchPage?(
    query: string,
    options: EditorSearchOptions,
    signal?: AbortSignal,
    cursor?: string | null
  ): Promise<EditorSearchPage>
  /** Replace matches only if the provider can confirm the searched occurrence count is unchanged. */
  replaceContents?(
    item: EditorItemRef,
    query: string,
    replacement: string,
    options: EditorReplaceOptions,
    expectedMatchCount: number
  ): Promise<boolean>
  create?(
    parentId: string | null,
    kind: 'file' | 'directory',
    name: string
  ): Promise<EditorTreeItem>
  rename?(item: EditorItemRef, name: string): Promise<EditorTreeItem>
  move?(items: readonly EditorItemRef[], parentId: string | null): Promise<void>
  delete?(items: readonly EditorItemRef[]): Promise<void>
}

/** Whether a provider both declares and implements a command. */
export function editorSupportsOperation(
  provider: EditorProvider | null | undefined,
  operation: EditorOperation
): boolean {
  if (!provider || !provider.capabilities.operations.has(operation)) return false
  switch (operation) {
    case 'createFile':
    case 'createDirectory':
      return typeof provider.create === 'function'
    case 'rename':
      return typeof provider.rename === 'function'
    case 'move':
      return typeof provider.move === 'function'
    case 'delete':
      return typeof provider.delete === 'function'
  }
}

/** Whether a provider advertises a search target supported by its search method. */
export function editorSupportsSearch(
  provider: EditorProvider | null | undefined,
  target: EditorSearchOptions['target']
): boolean {
  if (!provider) return false
  return target === 'names'
    ? provider.capabilities.searchNames
    : provider.capabilities.searchContents
}

/** Match a CodeMirror language name against a provider's declared language support. */
export function editorSupportsCodeLanguage(
  provider: EditorProvider | null | undefined,
  language: string
): boolean {
  if (!provider) return false
  const languages = provider.capabilities.codeLanguages
  return languages.has('*') || languages.has(language.toLocaleLowerCase())
}

export interface EditorDocumentSnapshot {
  content: { type: 'text'; text: string } | { type: 'asset'; previewUrl: string; mediaType: string }
  /** Opaque to the shared editor. Providers use it to detect/reconcile stale edits. */
  revision: string
  savePhase: EditorSavePhase
  message?: string
  /** Optional remote mirror status, e.g. PKMS GitHub synchronization. */
  syncPhase?: EditorSyncPhase
}

export interface EditorDocumentSession {
  readonly item: EditorTreeItem
  readonly readOnly: boolean
  /** Refreshes provider metadata after a rename/move without reopening the document. */
  updateItem?(item: EditorTreeItem): void
  snapshot(): EditorDocumentSnapshot
  subscribe(listener: (snapshot: EditorDocumentSnapshot) => void): () => void
  replaceText(text: string, baseRevision: string): Promise<void>
  /** Flushes pending durable writes. */
  /** Flush durable provider writes. `flushSync: false` may leave a secondary mirror pending. */
  save(options?: { flushSync?: boolean }): Promise<EditorDocumentSnapshot>
  /** Releases provider subscriptions and session resources. */
  close(): Promise<void>
}
