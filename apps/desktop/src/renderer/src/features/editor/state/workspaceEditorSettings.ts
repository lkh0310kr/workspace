import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { getStoredAutoSave } from './autosave'

export interface WorkspaceEditorSettings {
  autoSave: boolean
  hiddenFiles: string[]
  hideMarkdownExtension: boolean
  treeOrder: string[]
}

interface Snapshot {
  settings: WorkspaceEditorSettings
  loaded: boolean
  error: string | null
}

const SETTINGS_PATH = '.workspace/settings.json'
const DEFAULT_SETTINGS: WorkspaceEditorSettings = {
  autoSave: false,
  hiddenFiles: [],
  hideMarkdownExtension: false,
  treeOrder: []
}
const snapshots = new Map<string, Snapshot>()
const listeners = new Map<string, Set<() => void>>()
const loads = new Map<string, Promise<void>>()
const saves = new Map<string, Promise<WorkspaceEditorSettings>>()

function legacyAutoSave(): boolean {
  return getStoredAutoSave()
}

function defaultSnapshot(): Snapshot {
  return {
    settings: { ...DEFAULT_SETTINGS, autoSave: legacyAutoSave() },
    loaded: false,
    error: null
  }
}

function getSnapshot(rootPath: string): Snapshot {
  let snapshot = snapshots.get(rootPath)
  if (!snapshot) {
    snapshot = defaultSnapshot()
    snapshots.set(rootPath, snapshot)
  }
  return snapshot
}

function notify(rootPath: string): void {
  for (const listener of listeners.get(rootPath) ?? []) listener()
}

function subscribe(rootPath: string, listener: () => void): () => void {
  let scopeListeners = listeners.get(rootPath)
  if (!scopeListeners) {
    scopeListeners = new Set()
    listeners.set(rootPath, scopeListeners)
  }
  scopeListeners.add(listener)
  return () => {
    scopeListeners?.delete(listener)
    if (scopeListeners?.size === 0) listeners.delete(rootPath)
  }
}

function parseSettings(
  raw: string | null,
  fallback: WorkspaceEditorSettings
): WorkspaceEditorSettings {
  if (raw === null) return { ...fallback }
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS }
    const editor = (value as { editor?: unknown }).editor
    if (!editor || typeof editor !== 'object') return { ...DEFAULT_SETTINGS }
    const record = editor as Record<string, unknown>
    const hiddenFiles = Array.isArray(record.hiddenFiles)
      ? record.hiddenFiles.filter((item): item is string => typeof item === 'string')
      : []
    const treeOrder = Array.isArray(record.treeOrder)
      ? record.treeOrder.filter((item): item is string => typeof item === 'string')
      : []
    return {
      autoSave: typeof record.autoSave === 'boolean' ? record.autoSave : fallback.autoSave,
      hiddenFiles,
      hideMarkdownExtension:
        typeof record.hideMarkdownExtension === 'boolean'
          ? record.hideMarkdownExtension
          : DEFAULT_SETTINGS.hideMarkdownExtension,
      treeOrder
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function loadWorkspaceEditorSettings(tabId: number, rootPath: string): Promise<void> {
  if (!rootPath) return
  if (typeof window === 'undefined' || typeof window.api?.fs?.readFile !== 'function') return
  const current = getSnapshot(rootPath)
  if (current.loaded) return
  const inFlight = loads.get(rootPath)
  if (inFlight) return inFlight

  const load = window.api.fs
    .readFile(tabId, SETTINGS_PATH, rootPath)
    .then((raw) => {
      const latest = getSnapshot(rootPath)
      snapshots.set(rootPath, {
        settings: parseSettings(raw, latest.settings),
        loaded: true,
        error: null
      })
    })
    .catch((error: unknown) => {
      snapshots.set(rootPath, {
        ...getSnapshot(rootPath),
        loaded: false,
        error: error instanceof Error ? error.message : String(error)
      })
    })
    .finally(() => {
      loads.delete(rootPath)
      notify(rootPath)
    })
  loads.set(rootPath, load)
  notify(rootPath)
  return load
}

export async function saveWorkspaceEditorSettings(
  tabId: number,
  rootPath: string,
  settings: WorkspaceEditorSettings
): Promise<void> {
  await updateWorkspaceEditorSettings(tabId, rootPath, () => settings)
}

export async function updateWorkspaceEditorSettings(
  tabId: number,
  rootPath: string,
  update: (current: WorkspaceEditorSettings) => WorkspaceEditorSettings
): Promise<WorkspaceEditorSettings> {
  await loadWorkspaceEditorSettings(tabId, rootPath)
  if (!getSnapshot(rootPath).loaded) {
    throw new Error(getSnapshot(rootPath).error ?? 'Workspace settings are not available')
  }

  const previousSave = saves.get(rootPath) ?? Promise.resolve(getSnapshot(rootPath).settings)
  const save = previousSave
    .catch(() => getSnapshot(rootPath).settings)
    .then(async () => {
      const previousSnapshot = getSnapshot(rootPath)
      const settings = update(previousSnapshot.settings)
      if (settings === previousSnapshot.settings) return settings
      const normalized = {
        autoSave: settings.autoSave === true,
        hiddenFiles: [
          ...new Set(settings.hiddenFiles.map((pattern) => pattern.trim()).filter(Boolean))
        ],
        hideMarkdownExtension: settings.hideMarkdownExtension === true,
        treeOrder: [...new Set(settings.treeOrder.map((path) => path.trim()).filter(Boolean))]
      }
      snapshots.set(rootPath, { settings: normalized, loaded: true, error: null })
      notify(rootPath)
      const content = `${JSON.stringify({ editor: normalized }, null, 2)}\n`
      try {
        await window.api.fs.writeFile(tabId, SETTINGS_PATH, content, rootPath)
      } catch (error) {
        if (getSnapshot(rootPath).settings === normalized) {
          snapshots.set(rootPath, previousSnapshot)
          notify(rootPath)
        }
        throw error
      }
      return normalized
    })
  saves.set(rootPath, save)
  try {
    return await save
  } finally {
    if (saves.get(rootPath) === save) saves.delete(rootPath)
  }
}

export function useWorkspaceEditorSettings(tabId: number, rootPath: string): Snapshot {
  const subscribeToRoot = useCallback(
    (listener: () => void) => subscribe(rootPath, listener),
    [rootPath]
  )
  const readSnapshot = useCallback(() => getSnapshot(rootPath), [rootPath])
  const snapshot = useSyncExternalStore(subscribeToRoot, readSnapshot, defaultSnapshot)
  useEffect(() => {
    void loadWorkspaceEditorSettings(tabId, rootPath)
  }, [tabId, rootPath])
  return snapshot
}
