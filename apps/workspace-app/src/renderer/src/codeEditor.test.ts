import { describe, expect, it } from 'vitest'
import { CompletionContext } from '@codemirror/autocomplete'
import type { Completion } from '@codemirror/autocomplete'
import {
  LanguageDescription,
  highlightingFor,
  syntaxTree
} from '../../../../../node_modules/@codemirror/language'
import { Compartment, EditorState } from '../../../../../node_modules/@codemirror/state'
import { tags } from '../../../../../node_modules/@lezer/highlight'
import { languages } from '../../../../../node_modules/@codemirror/language-data'
import {
  collectDocumentWords,
  createCodeEditorExtensions,
  createCodeSnippetExtension,
  documentWordCompletion
} from '@workspace/editor'

describe('code editor document completion', () => {
  it('offers unique identifier words matching the current prefix', () => {
    expect(collectDocumentWords('const userName = 1; userInfo(userName)', 'user')).toEqual([
      'userInfo',
      'userName'
    ])
  })

  it('keeps Unicode identifiers and caps the result count', () => {
    expect(collectDocumentWords('값 = 1; 값들 = 값', '값')).toEqual(['값들'])
    expect(collectDocumentWords('alpha alpine altar', 'al', 2)).toHaveLength(2)
  })

  it('does not offer completions for an empty prefix', () => {
    expect(collectDocumentWords('alpha beta', '')).toEqual([])
  })

  it('provides CodeMirror completions for words already used in the document', () => {
    const state = EditorState.create({
      doc: 'const userName = 1; user',
      extensions: createCodeEditorExtensions()
    })
    const result = documentWordCompletion(new CompletionContext(state, state.doc.length, false))
    expect(result?.options.map((option) => option.label)).toEqual(['userName'])
  })

  it('registers language-specific snippets with the completion system', () => {
    const state = EditorState.create({
      extensions: createCodeSnippetExtension('TypeScript')
    })
    const snippets = state.languageDataAt<readonly Completion[]>('autocomplete', 0).flat()
    expect(snippets.map((snippet) => snippet.label)).toContain('log')
    expect(snippets.map((snippet) => snippet.label)).toContain('fn')
    expect(createCodeEditorExtensions()).toBeDefined()
  })

  it('loads TypeScript parsing and assigns source-token highlighting', async () => {
    const description = LanguageDescription.matchFilename(languages, 'codeEditor.ts')
    expect(description?.name).toBe('TypeScript')
    const support = await description!.load()
    const state = EditorState.create({
      doc: 'const answer = 42;',
      extensions: [support, createCodeEditorExtensions()]
    })

    expect(syntaxTree(state).toString()).toContain('Number')
    expect(highlightingFor(state, [tags.number])).toBeTruthy()
  })

  it('reapplies a loaded language after the document state is replaced', async () => {
    const description = LanguageDescription.matchFilename(languages, 'codeEditor.ts')
    const compartment = new Compartment()
    const extensions = [compartment.of([]), ...createCodeEditorExtensions()]
    const support = await description!.load()

    // Opening the document replaces EditorState using the host's base extension
    // list, which resets compartment reconfigurations made while it was loading.
    const documentState = EditorState.create({ doc: 'const answer = 42;', extensions })
    const languageReadyState = documentState.update({
      effects: compartment.reconfigure(support)
    }).state

    expect(syntaxTree(languageReadyState).toString()).toContain('Number')
    expect(highlightingFor(languageReadyState, [tags.number])).toBeTruthy()
  })
})
