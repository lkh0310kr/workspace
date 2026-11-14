import {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type Key,
  type ReactNode
} from 'react'
import { EditorView } from '@codemirror/view'
import type { EditorMarkdownDocumentProps } from './EditorMarkdownDocument'
import type { EditorMarkdownSurfaceProps } from './EditorMarkdownSurface'
import { EditorMarkdownDocument } from './EditorMarkdownDocument'

const EditorMarkdownSurface = lazy(() =>
  import('./EditorMarkdownSurface').then((module) => ({ default: module.EditorMarkdownSurface }))
)

export interface EditorMarkdownEditorProps extends Omit<EditorMarkdownDocumentProps, 'children'> {
  surfaceProps: EditorMarkdownSurfaceProps
  surfaceKey?: Key
  surfaceContainerClassName?: string
  surfaceContainerStyle?: CSSProperties
  loadingFallback?: ReactNode
}

/** Shared Markdown frame and lazy editor-surface composition for product hosts. */
export function EditorMarkdownEditor({
  surfaceProps,
  surfaceKey,
  surfaceContainerClassName,
  surfaceContainerStyle,
  loadingFallback = <div className="editor-loading">Opening editor…</div>,
  ...documentProps
}: EditorMarkdownEditorProps) {
  const [propertiesView, setPropertiesView] = useState<EditorView | null>(null)
  const [propertiesRevision, setPropertiesRevision] = useState(0)
  const onViewReady = useCallback(
    (view: EditorView | null) => {
      setPropertiesView(view)
      surfaceProps.onViewReady?.(view)
    },
    [surfaceProps.onViewReady]
  )
  const propertyUpdateListener = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (update.docChanged) setPropertiesRevision((revision) => revision + 1)
      }),
    []
  )
  const sharedSurfaceProps = useMemo(
    () => ({
      ...surfaceProps,
      onViewReady,
      extensions: [...(surfaceProps.extensions ?? []), propertyUpdateListener]
    }),
    [onViewReady, propertyUpdateListener, surfaceProps]
  )
  const surface = (
    <Suspense fallback={loadingFallback}>
      <EditorMarkdownSurface key={surfaceKey} {...sharedSurfaceProps} />
    </Suspense>
  )

  return (
    <EditorMarkdownDocument
      {...documentProps}
      propertiesView={propertiesView}
      propertiesRevision={propertiesRevision}
    >
      {surfaceContainerClassName || surfaceContainerStyle ? (
        <div className={surfaceContainerClassName} style={surfaceContainerStyle}>
          {surface}
        </div>
      ) : (
        surface
      )}
    </EditorMarkdownDocument>
  )
}
