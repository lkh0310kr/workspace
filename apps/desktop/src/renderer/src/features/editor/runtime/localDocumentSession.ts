import { EditorProviderError } from '@workspace/editor'
import type {
  EditorDocumentSession,
  EditorDocumentSnapshot,
  EditorTreeItem
} from '@workspace/editor'
import { getMediaUrl } from '../../../electron'
import { readFile, writeFileIfUnchanged } from './localFileSystem'

type ItemKindForPath = (path: string, directory: boolean) => EditorTreeItem['kind']

export class LocalDocumentSession implements EditorDocumentSession {
  private value = ''
  private baseValue = ''
  private savingValue: string | null = null
  private previewUrl = ''
  private mediaType = 'application/octet-stream'
  private revision = '0'
  private phase: EditorDocumentSnapshot['savePhase'] = 'clean'
  private message?: string
  private listeners = new Set<(snapshot: EditorDocumentSnapshot) => void>()
  private closed = false

  constructor(
    public item: EditorTreeItem,
    private tabId: number,
    private rootPath: string,
    private onClose: () => void,
    private itemKindForPath: ItemKindForPath
  ) {}

  get readOnly(): boolean {
    return this.item.kind === 'asset'
  }

  async load(): Promise<void> {
    if (this.item.kind === 'asset') {
      const url = await getMediaUrl(this.tabId, this.item.path, this.rootPath)
      if (!url) throw new Error('Could not preview this file')
      this.previewUrl = url
      this.mediaType = mediaTypeFor(this.item.path)
      this.revision = url
      this.phase = 'clean'
      this.emit()
      return
    }
    const value = await readFile(this.tabId, this.item.path, this.rootPath)
    if (value === null) throw new EditorProviderError('notFound', 'Document no longer exists')
    this.value = value
    this.baseValue = value
    this.revision = crypto.randomUUID()
    this.phase = 'clean'
    this.message = undefined
    this.emit()
  }

  snapshot(): EditorDocumentSnapshot {
    return {
      content:
        this.item.kind === 'asset'
          ? { type: 'asset', previewUrl: this.previewUrl, mediaType: this.mediaType }
          : { type: 'text', text: this.value },
      revision: this.revision,
      savePhase: this.phase,
      ...(this.message ? { message: this.message } : {})
    }
  }

  subscribe(listener: (snapshot: EditorDocumentSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  async replaceText(text: string, baseRevision: string): Promise<void> {
    if (this.closed) throw new EditorProviderError('notFound', 'Document session is closed')
    if (this.readOnly) throw new EditorProviderError('readOnly', 'Document is read only')
    if (this.phase === 'conflict')
      throw new EditorProviderError(
        'conflict',
        this.message ?? 'The file changed on disk. Reload it before saving.'
      )
    if (baseRevision !== this.revision) {
      this.phase = 'conflict'
      this.message = 'The file changed on disk. Reload it before saving.'
      this.emit()
      throw new EditorProviderError('conflict', this.message)
    }
    this.value = text
    this.phase = 'dirty'
    this.message = undefined
    this.emit()
  }

  async save(): Promise<EditorDocumentSnapshot> {
    if (this.phase === 'conflict')
      throw new EditorProviderError('conflict', this.message ?? 'File changed on disk')
    if (this.phase !== 'dirty') return this.snapshot()
    const savedValue = this.value
    const expectedValue = this.baseValue
    this.savingValue = savedValue
    this.phase = 'saving'
    this.emit()
    try {
      const written = await writeFileIfUnchanged(
        this.tabId,
        this.item.path,
        expectedValue,
        savedValue,
        this.rootPath
      )
      if (!written) {
        this.markConflict('The file changed on disk before this save could be applied.')
        throw new EditorProviderError(
          'conflict',
          this.message ?? 'The file changed on disk before this save could be applied.'
        )
      }
      this.baseValue = savedValue
      this.revision = crypto.randomUUID()
      if (!this.isConflicted()) {
        this.phase = this.value === savedValue ? 'clean' : 'dirty'
        this.message = undefined
      }
    } catch (error) {
      if (!this.isConflicted()) {
        this.phase = 'error'
        this.message = error instanceof Error ? error.message : 'Could not save file'
        this.emit()
      }
      throw error
    } finally {
      this.savingValue = null
    }
    this.emit()
    return this.snapshot()
  }

  externalChange(paths: string[]): void {
    if (!paths.includes(this.item.path)) return
    void readFile(this.tabId, this.item.path, this.rootPath)
      .then((diskValue) => {
        if (this.closed) return
        if (this.phase === 'conflict') return
        if (diskValue === null) {
          if (this.phase === 'dirty' || this.phase === 'saving')
            this.markConflict('The file was removed while you had unsaved edits.')
          else {
            this.phase = 'error'
            this.message = 'Document no longer exists'
            this.emit()
          }
          return
        }
        // An in-flight write may finish after another edit returns the phase
        // to dirty. Its watcher echo must still be recognized as our write.
        if (this.savingValue !== null && diskValue === this.savingValue) return
        if (this.phase === 'dirty' || this.phase === 'saving') {
          if (diskValue !== this.baseValue)
            this.markConflict('The file changed on disk while you had unsaved edits.')
          return
        }
        if (diskValue === this.baseValue) return
        this.value = diskValue
        this.baseValue = diskValue
        this.revision = crypto.randomUUID()
        this.phase = 'clean'
        this.message = undefined
        this.emit()
      })
      .catch((error) => {
        if (this.closed) return
        if (error instanceof Error && error.message.startsWith('Workspace root changed;')) return
        this.phase = 'error'
        this.message =
          error instanceof Error ? error.message : 'Could not check the file after a change'
        this.emit()
      })
  }

  renamePath(from: string, to: string, name: string, parentId: string | null): void {
    if (this.item.path !== from) return
    this.item = {
      ...this.item,
      path: to,
      parentId,
      name,
      kind: this.itemKindForPath(to, false)
    }
    this.emit()
  }

  async close(): Promise<void> {
    this.closed = true
    this.listeners.clear()
    this.onClose()
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) listener(snapshot)
  }

  private markConflict(message: string): void {
    this.phase = 'conflict'
    this.message = message
    this.emit()
  }

  private isConflicted(): boolean {
    return this.phase === 'conflict'
  }
}

function mediaTypeFor(path: string): string {
  const ext = path.split('.').at(-1)?.toLowerCase()
  const types: Record<string, string> = {
    avif: 'image/avif',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    pdf: 'application/pdf'
  }
  return types[ext ?? ''] ?? 'application/octet-stream'
}
