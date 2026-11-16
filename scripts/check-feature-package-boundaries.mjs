import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packages = ['home', 'browser', 'terminal']
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

for (const feature of packages) {
  const sourceRoot = path.join(root, 'packages', feature, 'src')
  for (const file of await walk(sourceRoot)) {
    const source = await readFile(file, 'utf8')
    const relativePath = path.relative(root, file)
    const imports = source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g)

    for (const [, specifier] of imports) {
      if (specifier.includes('apps/desktop') || specifier.startsWith('@renderer/')) {
        failures.push(`${relativePath} imports Desktop shell module ${specifier}`)
      }
      if (specifier.startsWith('.')) {
        const resolvedPath = path.resolve(path.dirname(file), specifier)
        const desktopRoot = path.join(root, 'apps', 'desktop')
        const resolvedFeature = packages.find((name) =>
          resolvedPath.startsWith(path.join(root, 'packages', name) + path.sep)
        )
        if (resolvedPath.startsWith(desktopRoot + path.sep)) {
          failures.push(`${relativePath} imports Desktop shell module ${specifier}`)
        }
        if (resolvedFeature && resolvedFeature !== feature) {
          failures.push(
            `${relativePath} imports sibling feature package ${resolvedFeature} via ${specifier}`
          )
        }
      }
      if (/^@workspace\/(?:home|browser|terminal)(?:\/|$)/.test(specifier)) {
        failures.push(
          `${relativePath} imports a feature package through its workspace alias: ${specifier}`
        )
      }
    }

    if (/\bwindow\s*(?:\?\s*\.\s*|\.\s*)api(?=\s*(?:\?\.|\.|\(|\[|;|,|\)|=))/.test(source)) {
      failures.push(
        `${relativePath} accesses window.api directly; inject the capability through the feature host`
      )
    }
    if (/\bElectron\./.test(source)) {
      failures.push(
        `${relativePath} depends on Electron ambient types; define the feature port and adapt it in Desktop`
      )
    }
  }
}

if (failures.length > 0) {
  console.error('Feature package boundary check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log('Home, Browser, and Terminal package boundaries passed.')
}
