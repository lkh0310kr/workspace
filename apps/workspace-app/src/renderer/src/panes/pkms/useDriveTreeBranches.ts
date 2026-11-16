import { useCallback, useRef, useState } from 'react'
import type { GoogleDriveWorkspaceEntry } from '@pkms/google-drive'

export type DriveTreeBranches = Map<string, GoogleDriveWorkspaceEntry[]>

interface LoadFolderOptions {
  rootId: string
  entry: GoogleDriveWorkspaceEntry
  defer: boolean
  listDirectory: (rootId: string, parentId: string | null) => Promise<GoogleDriveWorkspaceEntry[]>
  onChildrenLoaded: (children: GoogleDriveWorkspaceEntry[]) => void
  onError: (cause: unknown) => void
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useDriveTreeBranches() {
  const [branches, setBranches] = useState<DriveTreeBranches>(() => new Map())
  const branchesRef = useRef(branches)
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(() => new Set())
  const loadingFoldersRef = useRef(loadingFolders)
  const branchGeneration = useRef(new Map<string, number>())
  const workspaceGeneration = useRef(0)
  const deferredFolders = useRef(new Set<string>())

  const publishBranches = useCallback((next: DriveTreeBranches): void => {
    branchesRef.current = next
    setBranches(next)
  }, [])

  const publishLoadingFolders = useCallback((next: Set<string>): void => {
    loadingFoldersRef.current = next
    setLoadingFolders(next)
  }, [])

  const beginWorkspaceChange = useCallback((): number => {
    workspaceGeneration.current += 1
    for (const path of loadingFoldersRef.current) {
      branchGeneration.current.set(path, (branchGeneration.current.get(path) ?? 0) + 1)
    }
    publishLoadingFolders(new Set())
    return workspaceGeneration.current
  }, [publishLoadingFolders])

  const isCurrentWorkspace = useCallback(
    (generation: number): boolean => generation === workspaceGeneration.current,
    []
  )

  const setRootEntries = useCallback(
    (entries: GoogleDriveWorkspaceEntry[]): void => {
      branchGeneration.current.clear()
      deferredFolders.current.clear()
      publishLoadingFolders(new Set())
      publishBranches(new Map([['', entries]]))
    },
    [publishBranches, publishLoadingFolders]
  )

  const getBranch = useCallback(
    (path: string): GoogleDriveWorkspaceEntry[] | undefined => branchesRef.current.get(path),
    []
  )

  const getEntry = useCallback(
    (path: string): GoogleDriveWorkspaceEntry | undefined =>
      [...branchesRef.current.values()].flat().find((entry) => entry.path === path),
    []
  )

  const getEntries = useCallback((): GoogleDriveWorkspaceEntry[] => {
    return [...branchesRef.current.values()].flat()
  }, [])

  const invalidateBranch = useCallback(
    (path: string): void => {
      branchGeneration.current.set(path, (branchGeneration.current.get(path) ?? 0) + 1)
      if (!loadingFoldersRef.current.has(path)) return
      const next = new Set(loadingFoldersRef.current)
      next.delete(path)
      publishLoadingFolders(next)
    },
    [publishLoadingFolders]
  )

  const invalidateSubtree = useCallback(
    (path: string): void => {
      const affectedPaths = new Set<string>([path])
      for (const branchPath of branchesRef.current.keys()) {
        if (branchPath === path || branchPath.startsWith(`${path}/`)) affectedPaths.add(branchPath)
      }
      for (const loadingPath of loadingFoldersRef.current) {
        if (loadingPath === path || loadingPath.startsWith(`${path}/`))
          affectedPaths.add(loadingPath)
      }
      for (const deferredPath of deferredFolders.current) {
        if (deferredPath === path || deferredPath.startsWith(`${path}/`))
          affectedPaths.add(deferredPath)
      }
      for (const affectedPath of affectedPaths) {
        branchGeneration.current.set(
          affectedPath,
          (branchGeneration.current.get(affectedPath) ?? 0) + 1
        )
      }
      const loading = new Set(loadingFoldersRef.current)
      for (const loadingPath of loading) {
        if (loadingPath === path || loadingPath.startsWith(`${path}/`)) loading.delete(loadingPath)
      }
      if (loading.size !== loadingFoldersRef.current.size) publishLoadingFolders(loading)
    },
    [publishLoadingFolders]
  )

  const replaceBranch = useCallback(
    (path: string, entries: GoogleDriveWorkspaceEntry[]): void => {
      const next = new Map(branchesRef.current)
      next.set(path, entries)
      publishBranches(next)
    },
    [publishBranches]
  )

  const replaceBranches = useCallback(
    (entries: ReadonlyArray<readonly [string, GoogleDriveWorkspaceEntry[]]>): void => {
      const next = new Map(branchesRef.current)
      entries.forEach(([path, branch]) => next.set(path, branch))
      publishBranches(next)
    },
    [publishBranches]
  )

  const mergeRefreshedBranch = useCallback(
    (
      path: string,
      entries: GoogleDriveWorkspaceEntry[],
      shouldPreservePath: (entryPath: string) => boolean
    ): void => {
      const current = branchesRef.current
      const optimisticIds = new Set(
        [...current.values()]
          .flat()
          .filter((entry) => shouldPreservePath(entry.path))
          .map((entry) => entry.id)
      )
      const optimistic = (current.get(path) ?? []).filter((entry) => shouldPreservePath(entry.path))
      const next = new Map(current)
      next.set(path, [...entries.filter((entry) => !optimisticIds.has(entry.id)), ...optimistic])
      publishBranches(next)
    },
    [publishBranches]
  )

  const refreshBranch = useCallback(
    async (
      rootId: string,
      path: string,
      parentId: string | null,
      listDirectory: (
        rootId: string,
        parentId: string | null
      ) => Promise<GoogleDriveWorkspaceEntry[]>,
      shouldPreservePath: (entryPath: string) => boolean
    ): Promise<GoogleDriveWorkspaceEntry[] | null> => {
      const generation = (branchGeneration.current.get(path) ?? 0) + 1
      branchGeneration.current.set(path, generation)
      const workspaceVersion = workspaceGeneration.current
      const entries = await listDirectory(rootId, parentId)
      if (
        !isCurrentWorkspace(workspaceVersion) ||
        branchGeneration.current.get(path) !== generation
      )
        return null
      mergeRefreshedBranch(path, entries, shouldPreservePath)
      return entries
    },
    [isCurrentWorkspace, mergeRefreshedBranch]
  )

  const loadDeferredFolder = useCallback(
    async (
      rootId: string,
      path: string,
      parentId: string,
      listDirectory: (
        rootId: string,
        parentId: string | null
      ) => Promise<GoogleDriveWorkspaceEntry[]>
    ): Promise<boolean> => {
      const generation = (branchGeneration.current.get(path) ?? 0) + 1
      branchGeneration.current.set(path, generation)
      const workspaceVersion = workspaceGeneration.current
      const entries = await listDirectory(rootId, parentId)
      if (
        !isCurrentWorkspace(workspaceVersion) ||
        branchGeneration.current.get(path) !== generation
      )
        return false
      replaceBranch(path, entries)
      deferredFolders.current.delete(path)
      return true
    },
    [isCurrentWorkspace, replaceBranch]
  )

  const deferFolder = useCallback(
    (path: string): void => {
      deferredFolders.current.add(path)
      if (branchesRef.current.has(path)) return
      const next = new Map(branchesRef.current)
      next.set(path, [])
      publishBranches(next)
    },
    [publishBranches]
  )

  const getDeferredFolderPaths = useCallback((): string[] => [...deferredFolders.current], [])

  const clearDeferredFolder = useCallback((path: string): void => {
    deferredFolders.current.delete(path)
  }, [])

  const loadFolder = useCallback(
    async ({
      rootId,
      entry,
      defer,
      listDirectory,
      onChildrenLoaded,
      onError
    }: LoadFolderOptions): Promise<void> => {
      const path = entry.path
      if (defer) {
        deferFolder(path)
        return
      }
      if (branchesRef.current.has(path) && !deferredFolders.current.has(path)) return

      const generation = (branchGeneration.current.get(path) ?? 0) + 1
      branchGeneration.current.set(path, generation)
      const workspaceVersion = workspaceGeneration.current
      publishLoadingFolders(new Set(loadingFoldersRef.current).add(path))

      const isCurrentRequest = (): boolean =>
        isCurrentWorkspace(workspaceVersion) && branchGeneration.current.get(path) === generation

      try {
        const children = await listDirectory(rootId, entry.id)
        if (!isCurrentRequest()) return
        replaceBranch(path, children)
        deferredFolders.current.delete(path)
        onChildrenLoaded(children)

        // Warm one level beneath the opened folder so the next expansion is immediate.
        const childFolders = children.filter((child) => child.kind === 'folder')
        const warmed = await Promise.all(
          childFolders.map(async (child) => ({
            path: child.path,
            entries: await listDirectory(rootId, child.id)
          }))
        )
        if (!isCurrentRequest()) return
        const next = new Map(branchesRef.current)
        warmed.forEach(({ path: childPath, entries }) => next.set(childPath, entries))
        publishBranches(next)
      } catch (cause) {
        if (isCurrentRequest()) onError(cause)
      } finally {
        if (isCurrentRequest()) {
          const next = new Set(loadingFoldersRef.current)
          next.delete(path)
          publishLoadingFolders(next)
        }
      }
    },
    [deferFolder, isCurrentWorkspace, publishBranches, publishLoadingFolders, replaceBranch]
  )

  const addOptimisticEntry = useCallback(
    (parentPath: string, entry: GoogleDriveWorkspaceEntry): void => {
      const next = new Map(branchesRef.current)
      next.set(parentPath, [
        ...(next.get(parentPath) ?? []).filter((current) => current.name !== entry.name),
        entry
      ])
      publishBranches(next)
    },
    [publishBranches]
  )

  const appendEntryIfMissing = useCallback(
    (parentPath: string, entry: GoogleDriveWorkspaceEntry): void => {
      const next = new Map(branchesRef.current)
      const entries = next.get(parentPath) ?? []
      if (entries.some((current) => current.id === entry.id)) return
      next.set(parentPath, [...entries, entry])
      publishBranches(next)
    },
    [publishBranches]
  )

  const replaceEntry = useCallback(
    (parentPath: string, itemId: string, replacement: GoogleDriveWorkspaceEntry): void => {
      const next = new Map(branchesRef.current)
      next.set(
        parentPath,
        (next.get(parentPath) ?? []).map((entry) => (entry.id === itemId ? replacement : entry))
      )
      publishBranches(next)
    },
    [publishBranches]
  )

  const removeEntry = useCallback(
    (parentPath: string, itemId: string, entryPath: string): void => {
      const next = new Map(branchesRef.current)
      next.set(
        parentPath,
        (next.get(parentPath) ?? []).filter(
          (entry) => entry.id !== itemId && entry.path !== entryPath
        )
      )
      publishBranches(next)
    },
    [publishBranches]
  )

  const removeSubtree = useCallback(
    (path: string): void => {
      invalidateSubtree(path)
      const next = new Map(branchesRef.current)
      for (const branchPath of next.keys()) {
        if (branchPath === path || branchPath.startsWith(`${path}/`)) next.delete(branchPath)
      }
      for (const deferredPath of deferredFolders.current) {
        if (deferredPath === path || deferredPath.startsWith(`${path}/`)) {
          deferredFolders.current.delete(deferredPath)
        }
      }
      const loading = new Set(loadingFoldersRef.current)
      for (const loadingPath of loading) {
        if (loadingPath === path || loadingPath.startsWith(`${path}/`)) {
          loading.delete(loadingPath)
        }
      }
      publishLoadingFolders(loading)
      publishBranches(next)
    },
    [invalidateSubtree, publishBranches, publishLoadingFolders]
  )

  const moveEntries = useCallback(
    (
      sourceEntries: GoogleDriveWorkspaceEntry[],
      movedEntries: GoogleDriveWorkspaceEntry[],
      destinationPath: string
    ): void => {
      const current = branchesRef.current
      const next = new Map(current)
      sourceEntries.forEach((entry) => {
        const parentPath = entry.path.split('/').slice(0, -1).join('/')
        next.set(
          parentPath,
          (next.get(parentPath) ?? []).filter((item) => item.id !== entry.id)
        )
        if (entry.kind !== 'folder') return
        const moved = movedEntries.find((item) => item.id === entry.id)
        if (!moved) return
        for (const [branchPath, children] of current) {
          if (branchPath !== entry.path && !branchPath.startsWith(`${entry.path}/`)) continue
          const nextPath = moved.path + branchPath.slice(entry.path.length)
          next.delete(branchPath)
          next.set(
            nextPath,
            children.map((child) => ({
              ...child,
              path: moved.path + child.path.slice(entry.path.length)
            }))
          )
        }
      })
      next.set(destinationPath, [...(next.get(destinationPath) ?? []), ...movedEntries])
      publishBranches(next)
    },
    [publishBranches]
  )

  return {
    branches,
    loadingFolders,
    beginWorkspaceChange,
    isCurrentWorkspace,
    setRootEntries,
    getBranch,
    getEntry,
    getEntries,
    invalidateBranch,
    invalidateSubtree,
    replaceBranch,
    replaceBranches,
    refreshBranch,
    loadDeferredFolder,
    getDeferredFolderPaths,
    clearDeferredFolder,
    loadFolder,
    addOptimisticEntry,
    appendEntryIfMissing,
    replaceEntry,
    removeEntry,
    removeSubtree,
    moveEntries
  }
}
