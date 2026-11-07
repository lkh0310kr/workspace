import type { HardwareSimReloadReason } from '../../../shared/hardwareSim'

function normalizeRelative(value: string): string {
  const segments: string[] = []
  for (const segment of value.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return segments.join('/')
}

function dirname(value: string): string {
  const index = value.lastIndexOf('/')
  return index < 0 ? '' : value.slice(0, index)
}

export function classifyHardwareSimChange(
  projectPath: string,
  firmwarePath: string | null,
  changedPaths: string[]
): HardwareSimReloadReason | null {
  const project = normalizeRelative(projectPath)
  if (!project) return null
  if (changedPaths.length === 0 || changedPaths.some((changed) => !changed)) return 'project'

  const normalized = changedPaths.map(normalizeRelative)
  if (normalized.includes(project)) return 'project'
  if (!firmwarePath) return null

  const firmware = normalizeRelative(`${dirname(project)}/${firmwarePath}`)
  if (normalized.includes(firmware)) return 'firmware-source'
  if (normalized.includes(`${firmware}.hex`)) return 'firmware-hex'
  return null
}
