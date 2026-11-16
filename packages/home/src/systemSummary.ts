/** Host-provided operating-system summary rendered by the Desktop Home feature. */
export interface SystemSummary {
  hostname: string
  platform: string
  release: string
  arch: string
  cpuPercent: number | null
  cpuCores: number
  memoryTotal: number
  memoryAvailable: number
  diskTotal: number | null
  diskAvailable: number | null
  uptimeSeconds: number
}

export type ReadSystemSummary = () => Promise<SystemSummary>
