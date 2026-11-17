import { useEffect, useMemo } from 'react'
import { EditorSearchPanel } from '@workspace/editor/search'
import { acquireLocalEditorProvider } from '../provider/local/localEditorProvider'

interface Props {
  tabId: number
  rootPath: string
  focusRequest: number
  onJumpToResult: (path: string, kind: 'code' | 'markdown' | 'viewer', line: number) => void
  onClose: () => void
}

/** Connect the package-owned search panel to the current Desktop workspace provider. */
export function SearchPanel({
  tabId,
  rootPath,
  focusRequest,
  onJumpToResult,
  onClose
}: Props): React.JSX.Element {
  const providerLease = useMemo(
    () => acquireLocalEditorProvider(tabId, rootPath),
    [tabId, rootPath]
  )

  useEffect(() => () => providerLease.release(), [providerLease])

  return (
    <EditorSearchPanel
      provider={providerLease.provider}
      focusRequest={focusRequest}
      onJumpToResult={onJumpToResult}
      onClose={onClose}
    />
  )
}
