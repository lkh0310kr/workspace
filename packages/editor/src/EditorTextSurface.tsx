import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { historyField } from '@codemirror/commands'
import { Annotation, EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { searchPanelOpen } from '@codemirror/search'
import { createEditorView, editorDocumentReplacement, replaceEditorDocument } from './codeMirror'
import {
  moveEditorViewState,
  readEditorViewState,
  writeEditorViewState,
  type EditorViewStateStorage
} from './viewStateCache'
import { useEditorDocumentSnapshot } from './useEditorDocumentSnapshot'
import { editorSearch } from './editorSearch'
import type { EditorDocumentSession } from './provider'
import 'katex/dist/katex.min.css'
import './editorHost.css'
import './markdown.css'

export const externalEditorChange = Annotation.define<boolean>()

export interface EditorTextSurfaceProps {
  /** Omit value for hosts that load documents through an EditorDocumentSession. */
  value?: string
  /** Optional provider session; owns the initial text, edits, and remote snapshots. */
  session?: EditorDocumentSession | null
  initialValue?: string
  extensions: readonly Extension[]
  onChange?: (value: string, view: EditorView) => void
  onSessionError?: (error: unknown) => void
  onViewReady?: (view: EditorView | null) => void
  onSearchPanelChange?: (open: boolean) => void
  className?: string
  ariaLabel?: string
  spellcheck?: boolean
  autocapitalize?: string
  /** Stable provider item identity, used to retain cursor, selection, scroll, and undo history. */
  documentKey?: string
  /** Return true only when a key change is the same document acquiring a stable provider identity. */
  onDocumentKeyChange?: (previousKey: string | undefined, nextKey: string | undefined) => boolean
  /** Host-owned persistence adapter; omitted to keep editor state in memory only. */
  viewStateStorage?: EditorViewStateStorage
}

/** Shared CodeMirror owner for both products; hosts contribute feature extensions. */
export function EditorTextSurface({
  value,
  session,
  initialValue,
  extensions,
  onChange,
  onSessionError,
  onViewReady,
  onSearchPanelChange,
  className,
  ariaLabel,
  spellcheck,
  autocapitalize,
  documentKey,
  onDocumentKeyChange,
  viewStateStorage
}: EditorTextSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const persistViewStateRef = useRef<(() => void) | null>(null)
  const documentKeyRef = useRef(documentKey)
  const onDocumentKeyChangeRef = useRef(onDocumentKeyChange)
  onDocumentKeyChangeRef.current = onDocumentKeyChange
  const viewStateStorageRef = useRef(viewStateStorage)
  const viewExtensionsRef = useRef<Extension[]>([])
  const onChangeRef = useRef(onChange)
  const onSessionErrorRef = useRef(onSessionError)
  const onViewReadyRef = useRef(onViewReady)
  const onSearchPanelChangeRef = useRef(onSearchPanelChange)
  const sessionSnapshot = useEditorDocumentSnapshot(session)
  const sessionRef = useRef(session)
  const sessionSnapshotRef = useRef(sessionSnapshot)
  const sessionText =
    sessionSnapshot?.content.type === 'text' ? sessionSnapshot.content.text : undefined
  const effectiveValue = sessionText ?? value
  sessionRef.current = session
  sessionSnapshotRef.current = sessionSnapshot
  onChangeRef.current = onChange
  onSessionErrorRef.current = onSessionError
  onViewReadyRef.current = onViewReady
  onSearchPanelChangeRef.current = onSearchPanelChange
  viewStateStorageRef.current = viewStateStorage

  useEffect(() => {
    if (!hostRef.current) return
    let persistenceTimer: ReturnType<typeof setTimeout> | null = null
    const persistNow = () => {
      if (persistenceTimer) clearTimeout(persistenceTimer)
      persistenceTimer = null
      const view = viewRef.current
      const key = documentKeyRef.current
      const snapshot = sessionSnapshotRef.current
      const persist = snapshot == null || snapshot.savePhase === 'clean'
      if (view && key)
        writeEditorViewState(
          key,
          view.state,
          view.scrollDOM.scrollTop,
          view.scrollDOM.scrollLeft,
          persist,
          viewStateStorageRef.current
        )
    }
    const schedulePersist = () => {
      if (persistenceTimer) clearTimeout(persistenceTimer)
      persistenceTimer = setTimeout(persistNow, 700)
    }
    persistViewStateRef.current = persistNow
    const attributes: Record<string, string> = {}
    if (ariaLabel) attributes['aria-label'] = ariaLabel
    if (spellcheck !== undefined) attributes.spellcheck = String(spellcheck)
    if (autocapitalize) attributes.autocapitalize = autocapitalize
    const hostExtensions: Extension[] = [...editorSearch, ...extensions]
    if (Object.keys(attributes).length)
      hostExtensions.push(EditorView.contentAttributes.of(attributes))
    hostExtensions.push(
      EditorView.updateListener.of((update) => {
        onSearchPanelChangeRef.current?.(searchPanelOpen(update.state))
        if (update.docChanged || update.selectionSet) schedulePersist()
        if (
          !update.docChanged ||
          update.transactions.some((transaction) => transaction.annotation(externalEditorChange))
        )
          return
        const text = update.state.doc.toString()
        const currentSession = sessionRef.current
        const snapshot = sessionSnapshotRef.current ?? currentSession?.snapshot()
        if (currentSession && !currentSession.readOnly && snapshot?.content.type === 'text') {
          const write = currentSession.replaceText(text, snapshot.revision)
          sessionSnapshotRef.current = currentSession.snapshot()
          void write.catch((error) => onSessionErrorRef.current?.(error))
        }
        onChangeRef.current?.(text, update.view)
      })
    )
    const cached = documentKey
      ? readEditorViewState(documentKey, viewStateStorageRef.current)
      : undefined
    const initialDocument = sessionText ?? initialValue ?? value ?? ''
    let restoredState: EditorState | undefined
    if (cached) {
      try {
        restoredState = EditorState.fromJSON(
          cached.serialized,
          {
            extensions: [
              history(),
              ...hostExtensions,
              keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
              EditorView.lineWrapping
            ]
          },
          { history: historyField }
        )
      } catch {
        restoredState = undefined
      }
    }
    if (restoredState) {
      const replacement = editorDocumentReplacement(
        restoredState,
        initialDocument,
        externalEditorChange
      )
      if (replacement) restoredState = replacement.state
    }
    const viewExtensions = [
      history(),
      ...hostExtensions,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.lineWrapping
    ]
    viewExtensionsRef.current = viewExtensions
    const view = createEditorView({
      parent: hostRef.current,
      doc: initialDocument,
      state: restoredState,
      extensions: viewExtensions
    })
    viewRef.current = view
    view.scrollDOM.addEventListener('scroll', schedulePersist, { passive: true })
    if (cached) {
      requestAnimationFrame(() => {
        if (viewRef.current === view) {
          view.scrollDOM.scrollTop = cached.scrollTop
          view.scrollDOM.scrollLeft = cached.scrollLeft
        }
      })
    }
    onViewReadyRef.current?.(view)
    onSearchPanelChangeRef.current?.(searchPanelOpen(view.state))
    return () => {
      view.scrollDOM.removeEventListener('scroll', schedulePersist)
      persistNow()
      persistViewStateRef.current = null
      onViewReadyRef.current?.(null)
      viewRef.current = null
      view.destroy()
    }
    // Editor extensions define the lifetime of this view; change the host key when their mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const previousKey = documentKeyRef.current
    if (previousKey === documentKey) return
    const view = viewRef.current
    if (!view) {
      documentKeyRef.current = documentKey
      return
    }
    persistViewStateRef.current?.()
    if (previousKey && documentKey && onDocumentKeyChangeRef.current?.(previousKey, documentKey)) {
      moveEditorViewState(previousKey, documentKey, viewStateStorageRef.current)
    }
    documentKeyRef.current = documentKey

    const cached = documentKey
      ? readEditorViewState(documentKey, viewStateStorageRef.current)
      : undefined
    const targetDocument = effectiveValue ?? ''
    let nextState: EditorState | undefined
    if (cached) {
      try {
        nextState = EditorState.fromJSON(
          cached.serialized,
          { extensions: viewExtensionsRef.current },
          { history: historyField }
        )
      } catch {
        nextState = undefined
      }
    }
    if (nextState) {
      const replacement = editorDocumentReplacement(nextState, targetDocument, externalEditorChange)
      if (replacement) nextState = replacement.state
    }
    view.setState(
      nextState ??
        EditorState.create({ doc: targetDocument, extensions: viewExtensionsRef.current })
    )
    onSearchPanelChangeRef.current?.(searchPanelOpen(view.state))
    view.scrollDOM.scrollTop = cached?.scrollTop ?? 0
    view.scrollDOM.scrollLeft = cached?.scrollLeft ?? 0
  }, [documentKey, effectiveValue])

  useEffect(() => {
    const view = viewRef.current
    if (!view || effectiveValue === undefined || view.state.doc.toString() === effectiveValue)
      return
    replaceEditorDocument(view, effectiveValue, externalEditorChange)
  }, [effectiveValue])

  useEffect(() => {
    if (sessionSnapshot?.savePhase === 'clean') persistViewStateRef.current?.()
  }, [sessionSnapshot])

  return (
    <div ref={hostRef} className={['editor-text-surface', className].filter(Boolean).join(' ')} />
  )
}
