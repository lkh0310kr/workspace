import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  snippetCompletion
} from '@codemirror/autocomplete'
import {
  copyLineDown,
  copyLineUp,
  defaultKeymap,
  deleteLine,
  historyKeymap,
  indentWithTab,
  moveLineDown,
  moveLineUp,
  toggleComment
} from '@codemirror/commands'
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { highlightSelectionMatches, selectNextOccurrence } from '@codemirror/search'
import {
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter
} from '@codemirror/view'
import { tags } from '@lezer/highlight'

/** Source-token colors for code content. This does not color file-tree rows/icons. */
export const codeSyntaxTheme = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword],
      color: 'var(--syntax-keyword)'
    },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--syntax-string)' },
    {
      tag: [tags.comment, tags.lineComment, tags.blockComment],
      color: 'var(--syntax-comment)',
      fontStyle: 'italic'
    },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--syntax-number)' },
    {
      tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
      color: 'var(--syntax-function)'
    },
    { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--syntax-type)' },
    { tag: tags.propertyName, color: 'var(--syntax-property)' },
    { tag: [tags.definition(tags.variableName), tags.variableName], color: 'var(--text)' },
    { tag: [tags.operator, tags.punctuation, tags.bracket], color: 'var(--text-muted)' },
    { tag: tags.tagName, color: 'var(--syntax-keyword)' },
    { tag: tags.attributeName, color: 'var(--syntax-function)' },
    { tag: tags.invalid, color: 'var(--syntax-invalid)' }
  ])
)

/** Collect unique in-document words for useful completion when no language server exists. */
export function collectDocumentWords(document: string, prefix: string, limit = 100): string[] {
  if (!prefix) return []
  const words = new Set<string>()
  const pattern = /[\p{L}_$][\p{L}\p{N}_$]*/gu
  for (const match of document.matchAll(pattern)) {
    const word = match[0]
    if (word !== prefix && word.startsWith(prefix)) {
      words.add(word)
      if (words.size >= limit) break
    }
  }
  return [...words].sort((a, b) => a.localeCompare(b))
}

function codeSnippets(languageName?: string) {
  const normalized = languageName?.toLowerCase() ?? ''
  const generic = [
    snippetCompletion('TODO: ${1:description}', {
      label: 'todo',
      type: 'keyword',
      detail: 'TODO note'
    })
  ]
  if (['javascript', 'typescript', 'jsx', 'tsx'].includes(normalized)) {
    generic.push(
      snippetCompletion('console.log(${1:value});', {
        label: 'log',
        type: 'function',
        detail: 'console.log'
      }),
      snippetCompletion('function ${1:name}(${2:args}) {\n    $0\n}', {
        label: 'fn',
        type: 'function',
        detail: 'Function'
      })
    )
  } else if (normalized === 'python') {
    generic.push(
      snippetCompletion('print(${1:value})', {
        label: 'print',
        type: 'function',
        detail: 'Print value'
      }),
      snippetCompletion('def ${1:name}(${2:args}):\n    $0', {
        label: 'def',
        type: 'function',
        detail: 'Function'
      })
    )
  }
  return generic
}

export function documentWordCompletion(
  context: import('@codemirror/autocomplete').CompletionContext
) {
  const word = context.matchBefore(/[\p{L}_$][\p{L}\p{N}_$]*/u)
  if (!word || word.from === word.to) return null
  const options = collectDocumentWords(context.state.doc.toString(), word.text).map((label) => ({
    label,
    type: 'text' as const
  }))
  return options.length ? { from: word.from, options, validFor: /^[\p{L}\p{N}_$]*$/u } : null
}

export interface CodeEditorExtensionOptions {
  /** Host-owned plain-text paste command. */
  pastePlainText?: (view: import('@codemirror/view').EditorView) => boolean
}

/** Language-specific snippets are reconfigured when a host changes documents. */
export function createCodeSnippetExtension(languageName?: string): Extension {
  return EditorState.languageData.of(() => [{ autocomplete: codeSnippets(languageName) }])
}

/** Shared baseline for code editing in Desktop Editor and any PKMS code surface. */
export function createCodeEditorExtensions({
  pastePlainText
}: CodeEditorExtensionOptions = {}): Extension[] {
  const autocompleteData = EditorState.languageData.of(() => [
    {
      autocomplete: [documentWordCompletion]
    }
  ])
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    foldGutter(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    indentOnInput(),
    highlightSelectionMatches(),
    autocompleteData,
    codeSyntaxTheme,
    keymap.of([
      { key: 'Mod-/', run: toggleComment },
      { key: 'Mod-d', run: selectNextOccurrence },
      { key: 'Alt-ArrowUp', run: moveLineUp },
      { key: 'Alt-ArrowDown', run: moveLineDown },
      { key: 'Shift-Alt-ArrowUp', run: copyLineUp },
      { key: 'Shift-Alt-ArrowDown', run: copyLineDown },
      { key: 'Mod-Shift-k', run: deleteLine },
      ...(pastePlainText ? [{ key: 'Mod-Shift-v', run: pastePlainText }] : []),
      ...closeBracketsKeymap,
      ...completionKeymap,
      ...foldKeymap,
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap
    ])
  ]
}
