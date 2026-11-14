import { useEffect, useMemo, useRef, useState } from 'react'
import { acquireLocalEditorProvider } from '../editor/localEditorProvider'
import {
  editorSupportsSearch,
  EditorQuickOpenDialog,
  useEditorQuickOpenSearch
} from '@workspace/editor'

// Cmd+P fuzzy file switcher — a centered modal, not anchor-rect-based like
// Popover.tsx (nothing to anchor to; it's summoned from anywhere).
interface Props {
  tabId: number
  onOpenFile: (path: string, kind: 'code' | 'markdown' | 'viewer') => void
  onClose: () => void
}

export function QuickOpen({ tabId, onOpenFile, onClose }: Props) {
  const [query, setQuery] = useState('')
  const providerLease = useMemo(() => acquireLocalEditorProvider(tabId), [tabId])
  const provider = providerLease.provider
  const supportsNameSearch = editorSupportsSearch(provider, 'names')
  const {
    items,
    loading,
    error: loadError
  } = useEditorQuickOpenSearch({ provider, query, enabled: supportsNameSearch, limit: 100 })
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => () => providerLease.release(), [providerLease])

  useEffect(() => {
    if (!supportsNameSearch) onCloseRef.current()
  }, [supportsNameSearch])

  const openSelected = (itemId: string): void => {
    const item = items.find((candidate) => candidate.itemId === itemId)
    if (!item) return
    const kind = item.kind === 'markdown' ? 'markdown' : item.kind === 'asset' ? 'viewer' : 'code'
    onOpenFile(item.path, kind)
    onClose()
  }

  if (!supportsNameSearch) return null
  return (
    <EditorQuickOpenDialog
      query={query}
      items={items.map((item) => ({ id: item.itemId, label: item.path }))}
      loading={loading}
      error={loadError}
      onQueryChange={setQuery}
      onSelect={openSelected}
      onClose={onClose}
    />
  )
}
