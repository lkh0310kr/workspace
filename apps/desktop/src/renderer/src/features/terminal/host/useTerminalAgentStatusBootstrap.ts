import { useEffect } from 'react'
import { installTerminalAgentStatusBridge } from './runtime'

export function useTerminalAgentStatusBootstrap(): void {
  useEffect(() => installTerminalAgentStatusBridge(), [])
}
