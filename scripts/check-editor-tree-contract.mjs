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
