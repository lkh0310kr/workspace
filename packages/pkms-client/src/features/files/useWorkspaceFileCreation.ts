import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { FileRecord, Workspace } from '../../domain/types'
import { createOperationId } from '../../domain/encoding'
import { submitWorkspaceAsset, submitWorkspaceOperation } from '../../client/workspaceOperations'

interface Options {
  workspace: Workspace | null
  files: FileRecord[]
  currentFolder: string
  request: <T = unknown>(path: string, options?: RequestInit) => Promise<T>
  setFiles: Dispatch<SetStateAction<FileRecord[]>>
  setLoadedFolders: Dispatch<SetStateAction<Set<string>>>
  setError: Dispatch<SetStateAction<string>>
  openFile: (file: FileRecord) => Promise<void>
}

export function useWorkspaceFileCreation({
  workspace,
  files,
  currentFolder,
  request,
  setFiles,
  setLoadedFolders,
  setError,
  openFile
}: Options) {
  const createNote = useCallback(
    async (directory: string, name: string, open = true): Promise<FileRecord | undefined> => {
      if (!workspace) return undefined
      const fileName = name.trim().endsWith('.md') ? name.trim() : `${name.trim()}.md`
      if (!fileName || /[\\/]/.test(fileName)) {
        setError('Enter a file name without a slash')
        return undefined
      }
      const basePath = `${directory ? `${directory}/` : ''}${fileName}`
      const fileId = createOperationId()
      let path = basePath
      let suffix = 2
      while (files.some((file) => file.path === path))
        path = basePath.replace(/\.md$/i, ` (${suffix++}).md`)
      const optimistic: FileRecord = {
        id: fileId,
        path,
        kind: 'markdown',
        revision: 0,
        content: '# Untitled\n\n'
      }
      setFiles((current) => [...current, optimistic])
      try {
        const result = await submitWorkspaceOperation(
          request,
          workspace,
          { type: 'create-file', path, fileId, content: '# Untitled\n\n' },
          'web'
        )
        const actualPath = result.conflictCopyPath ?? path
        setFiles((current) =>
          current.map((file) =>
            file.id === fileId
              ? { id: fileId, path: actualPath, kind: 'markdown', revision: file.revision }
              : file
          )
        )
        const created = {
          id: fileId,
          path: actualPath,
          kind: 'markdown' as const,
          revision: 0,
          content: '# Untitled\n\n'
        }
        if (open) await openFile(created)
        return created
      } catch (cause) {
        setFiles((current) => current.filter((file) => file.id !== fileId))
        setError(cause instanceof Error ? cause.message : 'Could not create note')
        return undefined
      }
    },
    [files, openFile, request, setError, setFiles, workspace]
  )

  const createFolder = useCallback(
    async (directory: string, name: string): Promise<FileRecord | undefined> => {
      if (!workspace) return undefined
      const folderName = name.trim()
      if (!folderName || /[\\/]/.test(folderName)) {
        setError('Enter a folder name without a slash')
        return undefined
      }
      const basePath = `${directory ? `${directory}/` : ''}${folderName}`
      let path = basePath
      let suffix = 2
      while (files.some((file) => file.path === path)) path = `${basePath} (${suffix++})`
      setFiles((current) => [
        ...current,
        { id: `folder-${path}`, path, kind: 'folder', revision: 0 }
      ])
      setLoadedFolders((current) => new Set(current).add(path))
      try {
        const result = await submitWorkspaceOperation(request, workspace, {
          type: 'create-folder',
          path
        })
        const actualPath = result.conflictCopyPath ?? path
        const actualId = `folder-${actualPath}`
        setFiles((current) =>
          current.map((file) =>
            file.path === path && file.kind === 'folder'
              ? { ...file, id: actualId, path: actualPath }
              : file
          )
        )
        if (actualPath !== path) {
          setLoadedFolders((current) => {
            const next = new Set(current)
            next.delete(path)
            next.add(actualPath)
            return next
          })
        }
        return { id: actualId, path: actualPath, kind: 'folder' as const, revision: 0 }
      } catch (cause) {
        setFiles((current) => current.filter((file) => file.path !== path))
        setLoadedFolders((current) => {
          const next = new Set(current)
          next.delete(path)
          return next
        })
        setError(cause instanceof Error ? cause.message : 'Could not create folder')
        return undefined
      }
    },
    [files, request, setError, setFiles, setLoadedFolders, workspace]
  )

  const uploadFile = useCallback(
    async (file?: File, directory = currentFolder) => {
      if (!file || !workspace) return
      const fileId = createOperationId()
      const basePath = `${directory ? `${directory}/` : ''}${file.name}`
      let path = basePath
      let suffix = 2
      while (files.some((entry) => entry.path === path)) {
        const dot = file.name.lastIndexOf('.')
        path =
          dot > 0
            ? `${directory ? `${directory}/` : ''}${file.name.slice(0, dot)} (${suffix++})${file.name.slice(dot)}`
            : `${basePath} (${suffix++})`
      }
      const clientId = `web-${createOperationId()}`
      setFiles((current) => [
        ...current,
        {
          id: fileId,
          path,
          kind: 'asset',
          revision: 0,
          size: file.size,
          contentType: file.type || 'application/octet-stream'
        }
      ])
      try {
        const result = await submitWorkspaceAsset(
          request,
          workspace.id,
          file,
          path,
          fileId,
          clientId
        )
        const actualPath = result.path ?? path
        setFiles((current) =>
          current.map((entry) => (entry.id === fileId ? { ...entry, path: actualPath } : entry))
        )
      } catch (cause) {
        setFiles((current) => current.filter((entry) => entry.id !== fileId))
        setError(cause instanceof Error ? cause.message : 'Upload failed')
      }
    },
    [currentFolder, files, request, setError, setFiles, workspace]
  )

  return { createNote, createFolder, uploadFile }
}
