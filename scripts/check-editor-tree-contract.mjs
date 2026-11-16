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
const sharedTreeStylesPath = path.join(root, 'packages/editor/src/treeView.module.css')
const sharedTreePanePath = path.join(root, 'packages/editor/src/EditorTreePane.tsx')
const sharedEditorThemesPath = path.join(root, 'packages/editor/src/themes.ts')
const sharedEditorMarkdownPath = path.join(root, 'packages/editor/src/EditorMarkdownEditor.tsx')
const sharedTreeView = await readFile(sharedTreeViewPath, 'utf8')
const sharedTreeStyles = await readFile(sharedTreeStylesPath, 'utf8')
const sharedTreePane = await readFile(sharedTreePanePath, 'utf8')
const sharedEditorThemes = await readFile(sharedEditorThemesPath, 'utf8')

if (!/className=\{\[styles\.view,[\s\S]{0,160}className\]/.test(sharedTreeView)) {
  failures.push('EditorTreeView must apply its CSS Module root class and host class.')
}
if (!/rootDropTarget\s*&&\s*styles\.rootDropTarget/.test(sharedTreeView)) {
  failures.push('EditorTreeView must expose root drop target state through its CSS Module.')
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
  !/\.view\s*\{[^}]*min-height:\s*100%[^}]*flex:\s*1 1 auto[^}]*flex-direction:\s*column[^}]*padding-block:\s*4px/s.test(
    sharedTreeStyles
  )
) {
  failures.push('packages/editor/src/treeView.module.css must own common tree root geometry.')
}
if (
  !/\.item\s*\{[^}]*height:\s*var\(--editor-tree-row-height,\s*27px\)[^}]*min-height:\s*var\(--editor-tree-row-height,\s*27px\)[^}]*padding-block:\s*3px[^}]*border:\s*0[^}]*border-radius:\s*4px/s.test(
    sharedTreeStyles
  )
) {
  failures.push('packages/editor/src/treeView.module.css must own shared tree row geometry.')
}
if (!/\.item\s*\{[^}]*line-height:\s*1\.4/s.test(sharedTreeStyles)) {
  failures.push('packages/editor/src/treeView.module.css must own shared tree row line height.')
}
if (
  !/\.createAction\s*\{[^}]*all:\s*unset[^}]*width:\s*26px[^}]*height:\s*26px/s.test(
    sharedTreeStyles
  )
) {
  failures.push('The shared tree action module must keep creation controls unboxed.')
}
if (
  !/data-editor-tree-row/.test(
    await readFile(path.join(root, 'packages/editor/src/EditorTreeRow.tsx'), 'utf8')
  ) ||
  !/data-editor-tree-content/.test(sharedTreePane)
) {
  failures.push(
    'Shared tree elements must expose stable data attributes for host styling and tests.'
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

for (const [relativePath, forbidden] of [
  [
    'apps/workspace-app/src/renderer/src/assets/styles.css',
    /\.workspace-editor-tree-toolbar|\.tree-view(?:-rows)?(?:[\s.:#[]|\s*\{)/
  ],
  [
    'packages/pkms-client/src/styles.css',
    /\.file-(?:list|tree|toolbar)|\.toolbar-actions|\.file-toolbar-heading/
  ],
  [
    'packages/pkms-google-drive/src/workspace.module.css',
    /\.pkms-google-drive-file-toolbar(?:-heading)?/
  ]
]) {
  const source = await readFile(path.join(root, relativePath), 'utf8')
  if (forbidden.test(source))
    failures.push(
      `${relativePath} must leave shared tree row and toolbar styling to @workspace/editor.`
    )
}

const driveStylesPath = path.join(root, 'packages/pkms-google-drive/src/workspace.module.css')
const driveStyles = await readFile(driveStylesPath, 'utf8')
const normalizedDriveStyles = driveStyles.replace(/\s+/g, ' ')
if (/\.pkms-google-drive-root\s+:where\(button/.test(normalizedDriveStyles)) {
  failures.push(
    'Google Drive must not style every button under its root; use explicit data-drive-control hooks.'
  )
}
if (!normalizedDriveStyles.includes('.pkms-google-drive-root [data-drive-control]')) {
  failures.push('Google Drive standalone controls must opt in through data-drive-control.')
}
if (
  !sharedTreeStyles.includes('.toolbarStatus > button') ||
  !sharedTreeStyles.includes('padding: 0;') ||
  !sharedTreeStyles.includes('border-radius: 0;')
) {
  failures.push('The shared EditorTreeToolbar must own unboxed tree status controls.')
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
  if (!sharedTreePane.includes(`data-editor-tree-${slot}=""`))
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
