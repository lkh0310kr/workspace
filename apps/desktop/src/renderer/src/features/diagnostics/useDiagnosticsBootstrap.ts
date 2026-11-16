import { useEffect } from 'react'
import { installRendererConsoleFileLogging } from '../../adapters/diagnostics/consoleFileLog'
import { installGlobalErrorLogging } from './errorLog'

export function useDiagnosticsBootstrap(): void {
  useEffect(() => installGlobalErrorLogging(), [])
  useEffect(() => {
    installRendererConsoleFileLogging()
  }, [])
}
