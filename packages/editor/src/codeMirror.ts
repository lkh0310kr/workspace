import { EditorState, Transaction, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

export interface CreateEditorViewOptions {
  parent: HTMLElement
  doc: string
  extensions: readonly Extension[]
  state?: EditorState
}

/** Create CodeMirror views through the shared Editor runtime in every product. */
export function createEditorView({
  parent,
  doc,
  extensions,
  state
}: CreateEditorViewOptions): EditorView {
  return new EditorView({
    state: state ?? EditorState.create({ doc, extensions: [...extensions] }),
    parent
  })
}

/** Build a minimal document replacement that maps the existing selection and history. */
export function editorDocumentReplacement(
  state: EditorState,
  text: string,
  externalChange?: import('@codemirror/state').AnnotationType<boolean>
): Transaction | null {
  const previous = state.doc.toString()
  if (previous === text) return null
  let prefix = 0
  while (prefix < previous.length && prefix < text.length && previous[prefix] === text[prefix])
    prefix++
  let suffix = 0
  while (
    suffix < previous.length - prefix &&
    suffix < text.length - prefix &&
    previous[previous.length - suffix - 1] === text[text.length - suffix - 1]
  )
    suffix++
  return state.update({
    changes: {
      from: prefix,
      to: previous.length - suffix,
      insert: text.slice(prefix, text.length - suffix)
    },
    annotations: [
      Transaction.addToHistory.of(false),
      ...(externalChange ? [externalChange.of(true)] : [])
    ]
  })
}

/** Apply provider snapshots as non-user edits so they do not enter local undo history. */
export function replaceEditorDocument(
  view: EditorView,
  text: string,
  externalChange?: import('@codemirror/state').AnnotationType<boolean>
): void {
  const transaction = editorDocumentReplacement(view.state, text, externalChange)
  if (transaction) view.dispatch(transaction)
}
