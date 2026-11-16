import assert from 'node:assert/strict'
import { test } from 'node:test'

const packageUrl = new URL('./', import.meta.url)

function expectedSourceUrl(relativePath) {
  return new URL(relativePath, packageUrl).href
}

test('resolves the editor package entrypoint and an existing declared CSS subpath', () => {
  assert.equal(import.meta.resolve('@workspace/editor'), expectedSourceUrl('src/index.ts'))
  assert.equal(
    import.meta.resolve('@workspace/editor/markdown-document.module.css'),
    expectedSourceUrl('src/markdownDocument.module.css')
  )
})

test('resolves the fuzzy search and CSS subpaths used by Workspace Desktop', () => {
  assert.equal(
    import.meta.resolve('@workspace/editor/fuzzySearch'),
    expectedSourceUrl('src/fuzzySearch.ts')
  )
  assert.equal(
    import.meta.resolve('@workspace/editor/treeView.module.css'),
    expectedSourceUrl('src/treeView.module.css')
  )
  assert.equal(
    import.meta.resolve('@workspace/editor/assetPreview.module.css'),
    expectedSourceUrl('src/assetPreview.module.css')
  )
})

test('keeps low-level tree component paths private', () => {
  assert.throws(() => import.meta.resolve('@workspace/editor/EditorTreeView'), {
    code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'
  })
})
