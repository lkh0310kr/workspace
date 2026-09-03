export type HardwarePinState = 'high' | 'low' | 'high_impedance' | 'unknown'

export interface HardwareComponentState {
  component_id: string
  state: Record<string, unknown>
}

export interface HardwareRuntimeState {
  time_ns: number
  pins: Record<string, HardwarePinState>
  components: Record<string, HardwareComponentState>
}

export interface HardwareSimStartResult {
  sessionId: number
  state: HardwareRuntimeState
}

export interface HardwareSimRuntimeUpdate {
  sessionId: number
  state: HardwareRuntimeState
}

export interface HardwareBuildResult {
  ok: boolean
  source: string
  fqbn: string
  tool: 'arduino-cli'
  toolPath: string
  version: string | null
  completedAt: string
  durationMs: number
  diagnostics: string[]
  hexPath?: string
  hexSha256?: string
}
