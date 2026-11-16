import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import * as Y from 'yjs'
import type { FileRecord, SyncStatus } from '../../domain/types'
import { createOperationId, toBase64 } from '../../domain/encoding'

export interface PkmsSaveResult {
  savePhase: 'clean' | 'error'
  syncPhase: 'synced' | 'pending' | 'blocked'
  message?: string
}

const AUTO_SAVE_DELAY_MS = 400

interface ActiveDocument {
  file: FileRecord | null
  documentKey: string | null
  doc: Y.Doc | null
}

interface Options {
  workspaceId?: string
  activeDocument: { current: ActiveDocument }
  request: <T = unknown>(path: string, options?: RequestInit) => Promise<T>
  setSaving: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string>>
  setSync: Dispatch<SetStateAction<SyncStatus>>
  setNotice: Dispatch<SetStateAction<string>>
}

export function useDocumentSync({
  workspaceId,
  activeDocument,
  request,
  setSaving,
  setError,
  setSync,
  setNotice
}: Options) {
  const autoSaveTimers = useRef(new Map<string, number>())

  const saveMarkdownToGitHub = useCallback(
    async (
      fileId: string,
      doc: Y.Doc,
      flushToGitHub = true,
      documentKey?: string
    ): Promise<PkmsSaveResult> => {
      const targetWorkspaceId = workspaceId
      const targetDocumentKey =
        documentKey ??
        (activeDocument.current.doc === doc
          ? (activeDocument.current.documentKey ?? undefined)
          : undefined)
      const isActiveDocument = () =>
        Boolean(targetDocumentKey && activeDocument.current.documentKey === targetDocumentKey)
      if (!targetWorkspaceId)
        return { savePhase: 'error', syncPhase: 'blocked', message: 'No active PKMS workspace' }
      if (isActiveDocument()) {
        setSaving(true)
        setError('')
      }
      try {
        await request(`/api/workspaces/${targetWorkspaceId}/files/${fileId}/updates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationId: createOperationId(),
            fileId,
            update: toBase64(Y.encodeStateAsUpdate(doc))
          })
        })
        const status = flushToGitHub
          ? await request<SyncStatus>(`/api/workspaces/${targetWorkspaceId}/flush`, {
              method: 'POST'
            })
          : await request<SyncStatus>(`/api/workspaces/${targetWorkspaceId}/sync-status`)
        if (
          targetDocumentKey &&
          activeDocument.current.documentKey === targetDocumentKey &&
          workspaceId === targetWorkspaceId
        ) {
          setSync(status)
          if (flushToGitHub && status.githubStatus === 'synced') setNotice('Saved to GitHub')
          else if (!flushToGitHub) setNotice('Saved')
          else if (status.githubStatus === 'external-change')
            setError(status.message ?? 'GitHub changed outside PKMS.')
          else setNotice('Saved locally')
        }
        if (status.githubStatus === 'synced') return { savePhase: 'clean', syncPhase: 'synced' }
        if (status.githubStatus === 'external-change')
          return { savePhase: 'clean', syncPhase: 'blocked', message: status.message }
        return { savePhase: 'clean', syncPhase: 'pending' }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Could not save to GitHub'
        if (isActiveDocument()) setError(message)
        return { savePhase: 'error', syncPhase: 'blocked', message }
      } finally {
        if (isActiveDocument()) setSaving(false)
      }
    },
    [activeDocument, request, setError, setNotice, setSaving, setSync, workspaceId]
  )

  const scheduleAutoSave = useCallback(
    (fileId: string, doc: Y.Doc, save?: () => Promise<unknown>, documentKey?: string) => {
      if (!workspaceId) return
      const key = `${workspaceId}:${fileId}`
      setNotice('Unsaved')
      const previous = autoSaveTimers.current.get(key)
      if (previous !== undefined) window.clearTimeout(previous)
      const timer = window.setTimeout(() => {
        autoSaveTimers.current.delete(key)
        void (save ? save() : saveMarkdownToGitHub(fileId, doc, false, documentKey)).catch(
          (cause: unknown) => {
            setError(cause instanceof Error ? cause.message : 'Could not autosave PKMS document')
          }
        )
      }, AUTO_SAVE_DELAY_MS)
      autoSaveTimers.current.set(key, timer)
    },
    [saveMarkdownToGitHub, setNotice, workspaceId]
  )

  const saveActiveFileNow = useCallback(() => {
    const current = activeDocument.current
    if (!current.file || current.file.kind !== 'markdown' || !current.doc) return
    const key = `${workspaceId}:${current.file.id}`
    const timer = autoSaveTimers.current.get(key)
    if (timer !== undefined) window.clearTimeout(timer)
    autoSaveTimers.current.delete(key)
    void saveMarkdownToGitHub(current.file.id, current.doc)
  }, [activeDocument, saveMarkdownToGitHub, workspaceId])

  return { scheduleAutoSave, saveActiveFileNow, saveDocument: saveMarkdownToGitHub }
}
