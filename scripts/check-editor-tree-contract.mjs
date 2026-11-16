import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'out') continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(absolute)))
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(absolute)
  }
  return files
}

const packageIndexPath = path.join(root, 'packages/editor/src/index.ts')
const packageJsonPath = path.join(root, 'packages/editor/package.json')
const packageIndex = await readFile(packageIndexPath, 'utf8')
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
const sharedTreeViewPath = path.join(root, 'packages/editor/src/EditorTreeView.tsx')
const sharedTreeStylesPath = path.join(root, 'packages/editor/src/tree.css')
const sharedTreePanePath = path.join(root, 'packages/editor/src/EditorTreePane.tsx')
const sharedEditorThemesPath = path.join(root, 'packages/editor/src/themes.ts')
const sharedEditorMarkdownPath = path.join(root, 'packages/editor/src/EditorMarkdownEditor.tsx')
const sharedTreeView = await readFile(sharedTreeViewPath, 'utf8')
const sharedTreeStyles = await readFile(sharedTreeStylesPath, 'utf8')
const sharedTreePane = await readFile(sharedTreePanePath, 'utf8')
const sharedEditorThemes = await readFile(sharedEditorThemesPath, 'utf8')

if (!/className=\{\['editor-tree-view',[\s\S]{0,120}className\]/.test(sharedTreeView)) {
  failures.push('EditorTreeView must apply the shared editor-tree-view root class.')
}
if (!/rootDropTarget\s*&&\s*'is-root-drop-target'/.test(sharedTreeView)) {
  failures.push(
    'EditorTreeView must expose the root drop target state through its shared root class.'
  )
}
if (
  !/if\s*\(inlineEdit\)[\s\S]*?aria-label=\{inlineEdit\.ariaLabel\}[\s\S]*?event\.key === 'Enter'[\s\S]*?event\.key === 'Escape'/.test(
    await readFile(path.join(root, 'packages/editor/src/EditorTreeRow.tsx'), 'utf8')
  )
) {
  failures.push(
    'EditorTreeRow must keep create and rename editing inline with Enter and Escape behavior.'
  )
}
if (
  !/if\s*\(!event\.defaultPrevented\s*&&\s*acceptsTreeDrag\(event\)\)\s*drop\(event,\s*''\)/.test(
    sharedTreeView
  )
) {
  failures.push('EditorTreeView must route blank-area drops to the workspace root.')
}
if (
  !/\.editor-tree-view\s*\{[^}]*min-height:\s*100%[^}]*flex:\s*1 1 auto[^}]*flex-direction:\s*column[^}]*padding-block:\s*4px/s.test(
    sharedTreeStyles
  )
) {
  failures.push('packages/editor/src/tree.css must own common tree root geometry.')
}
if (
  !/\.editor-tree-item\s*\{[^}]*height:\s*var\(--editor-tree-row-height,\s*27px\)[^}]*min-height:\s*var\(--editor-tree-row-height,\s*27px\)[^}]*padding-block:\s*3px[^}]*border:\s*0[^}]*border-radius:\s*4px/s.test(
    sharedTreeStyles
  )
) {
  failures.push('packages/editor/src/tree.css must own shared tree row geometry.')
}
if (!/\.editor-tree-item\s*\{[^}]*line-height:\s*1\.4/s.test(sharedTreeStyles)) {
  failures.push('packages/editor/src/tree.css must own shared tree row line height.')
}
if (
  !/\.editor-tree-create-actions button\s*\{[^}]*all:\s*unset[^}]*width:\s*26px[^}]*height:\s*26px/s.test(
    sharedTreeStyles
  )
) {
  failures.push(
    'packages/editor/src/tree.css must normalize shared tree creation controls without adding box decoration.'
  )
}
if (
  !/\.cm-md-fold-control'\s*:\s*\{[^}]*width:\s*'16px'[^}]*height:\s*'21px'[^}]*padding:\s*'0'[^}]*border:\s*'0'[^}]*borderRadius:\s*'0'/s.test(
    sharedEditorThemes
  )
) {
  failures.push(
    'packages/editor/src/themes.ts must own a borderless shared Markdown heading fold control.'
  )
}

for (const [relativePath, selector] of [
  ['apps/workspace-app/src/renderer/src/assets/styles.css', '.tree-view'],
  ['packages/pkms-client/src/styles.css', '.file-list']
]) {
  const source = await readFile(path.join(root, relativePath), 'utf8')
  const rule = source.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))
  if (!rule) {
    failures.push(`${relativePath} must keep the ${selector} host rule.`)
    continue
  }
  if (/\b(?:display|flex|height|min-height|max-height|margin|padding|gap)\s*:/.test(rule[1])) {
    failures.push(`${relativePath} must leave ${selector} root geometry to @workspace/editor.`)
  }
}

const driveStylesPath = path.join(root, 'packages/pkms-google-drive/src/workspace.css')
const driveStyles = await readFile(driveStylesPath, 'utf8')
const normalizedDriveStyles = driveStyles.replace(/\s+/g, ' ')
if (
  !normalizedDriveStyles.includes(
    '.pkms-google-drive-root button:not(.editor-tree-item):not(.cm-md-fold-control):not(.editor-tree-create-action)'
  )
) {
  failures.push(
    'Google Drive button reset must exclude shared tree rows, Markdown fold, and tree create controls.'
  )
}
if (
  !normalizedDriveStyles.includes(
    '.pkms-google-drive-root button:not(.editor-tree-create-action):disabled'
  )
) {
  failures.push(
    'Google Drive disabled button styling must preserve shared tree create control state.'
  )
}
if (
  /\.editor-markdown-document\.pkms-google-drive-markdown\s+\.editor-markdown-title\s*\{/.test(
    driveStyles
  )
) {
  failures.push('Google Drive must use the shared Markdown filename title width.')
}

if (
  !/export\s*\{[^}]*\bEditorTreePane\b[^}]*\}\s*from\s*['"]\.\/EditorTreePane['"]/.test(
    packageIndex
  )
) {
  failures.push('packages/editor/src/index.ts must publicly export EditorTreePane.')
}
if (
  !/export\s*\{[^}]*\bEditorTreeToolbar\b[^}]*\}\s*from\s*['"]\.\/EditorTreeToolbar['"]/.test(
    packageIndex
  )
) {
  failures.push('packages/editor/src/index.ts must publicly export EditorTreeToolbar.')
}
if (
  !/export\s*\{[^}]*\bEditorTreeCreateActions\b[^}]*\}\s*from\s*['"]\.\/EditorTreeCreateActions['"]/.test(
    packageIndex
  )
) {
  failures.push('packages/editor/src/index.ts must publicly export EditorTreeCreateActions.')
}
if (
  !/export\s*\{[^}]*\bEditorMarkdownEditor\b[^}]*\}\s*from\s*['"]\.\/EditorMarkdownEditor['"]/.test(
    packageIndex
  )
) {
  failures.push('packages/editor/src/index.ts must publicly export EditorMarkdownEditor.')
}
for (const slot of ['header', 'footer']) {
  if (!new RegExp(`\\b${slot}\\?: ReactNode`).test(sharedTreePane))
    failures.push(`EditorTreePane must keep the host-owned ${slot} slot.`)
  if (!sharedTreePane.includes(`editor-tree-pane-${slot}`))
    failures.push(`EditorTreePane must render the shared ${slot} slot wrapper.`)
}
for (const component of ['EditorTreeView', 'EditorTreeRow', 'EditorTreeVirtualList']) {
  const exportPattern = new RegExp(`export\\s+\\{[^}]*\\b${component}\\b[^}]*\\}\\s+from`)
  if (exportPattern.test(packageIndex))
    failures.push(`${component} must remain private to @workspace/editor.`)
}
for (const entry of Object.keys(packageJson.exports ?? {})) {
  if (/tree-row|EditorTreeView|EditorTreeVirtualList/.test(entry)) {
    failures.push(`Private tree implementation is exposed as package subpath ${entry}.`)
  }
}

const requiredConsumers = [
  'apps/workspace-app/src/renderer/src/components/TreeView.tsx',
  'apps/workspace-app/src/renderer/src/panes/pkms/PkmsGoogleDrivePane.tsx',
  'packages/pkms-client/src/components/FileTreeList.tsx'
]
const requiredToolbars = [
  'apps/workspace-app/src/renderer/src/components/TreeView.tsx',
  'apps/workspace-app/src/renderer/src/panes/pkms/PkmsGoogleDrivePane.tsx',
  'packages/pkms-client/src/PkmsClientApp.tsx'
]

for (const relativePath of requiredConsumers) {
  const source = await readFile(path.join(root, relativePath), 'utf8')
  if (!source.includes('<EditorTreePane')) {
    failures.push(`${relativePath} must render the shared EditorTreePane.`)
  }
}
for (const relativePath of requiredToolbars) {
  const source = await readFile(path.join(root, relativePath), 'utf8')
  if (!source.includes('<EditorTreeToolbar')) {
    failures.push(`${relativePath} must use the shared EditorTreeToolbar.`)
  }
}
for (const relativePath of requiredToolbars) {
  const source = await readFile(path.join(root, relativePath), 'utf8')
  if (!source.includes('<EditorTreeCreateActions'))
    failures.push(
      `${relativePath} must use shared EditorTreeCreateActions for file/folder creation.`
    )
}

const requiredEditorHosts = [
  'apps/workspace-app/src/renderer/src/panes/EditorContent.tsx',
  'apps/workspace-app/src/renderer/src/panes/pkms/PkmsGoogleDrivePane.tsx',
  'packages/pkms-client/src/PkmsClientApp.tsx'
]
for (const relativePath of requiredEditorHosts) {
  const source = await readFile(path.join(root, relativePath), 'utf8')
  if (!source.includes('EditorMarkdownEditor'))
    failures.push(`${relativePath} must compose the shared EditorMarkdownEditor.`)
  if (!source.includes('editorMarkdownParserExtensions'))
    failures.push(`${relativePath} must use the shared Markdown parser preset.`)
  if (!source.includes('editorCodeMirrorHostExtensions'))
    failures.push(`${relativePath} must use the shared CodeMirror host extensions.`)
  if (!source.includes('resolveEditorWikiLink'))
    failures.push(`${relativePath} must resolve PKMS wikilinks through @workspace/editor.`)
}
if (!/EditorMarkdownEditor/.test(await readFile(sharedEditorMarkdownPath, 'utf8')))
  failures.push('packages/editor must own the shared Markdown frame implementation.')

for (const directory of ['apps', 'packages/pkms-client/src']) {
  const files = await walk(path.join(root, directory))
  for (const absolutePath of files) {
    const relativePath = path.relative(root, absolutePath)
    const source = await readFile(absolutePath, 'utf8')
    if (
      /\bimport\s*(?:type\s*)?\{[^}]*\b(?:EditorTreeView|EditorTreeRow|EditorTreeVirtualList)\b[^}]*\}\s*from\s*['"][^'"]+['"]/.test(
        source
      )
    ) {
      failures.push(`${relativePath} imports a private tree implementation component.`)
    }
    if (
      /\bimport\s+(?:EditorTreeView|EditorTreeRow|EditorTreeVirtualList)\s+from\s*['"][^'"]+['"]/.test(
        source
      )
    ) {
      failures.push(`${relativePath} imports a private tree implementation component.`)
    }
    if (/(?:^|[\s<])role\s*=\s*["']tree(?:item)?["']/.test(source)) {
      failures.push(
        `${relativePath} declares a parallel tree/treeitem renderer outside @workspace/editor.`
      )
    }
  }
}

if (failures.length) {
  console.error('Editor tree architecture contract failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log('Editor tree architecture contract passed.')
}
