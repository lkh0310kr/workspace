import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registerBuiltinPaneKinds } from './panes/builtinPaneKinds'

function logRendererBootstrap(event: string, data?: Record<string, unknown>): void {
  try {
    window.api?.debug?.appLog('renderer', 'info', event, data)
  } catch {
    /* preload not ready */
  }
  console.info('[renderer-bootstrap]', event, data ?? {})
}

logRendererBootstrap('main_tsx_loaded', { href: window.location.href })

window.addEventListener('error', (event) => {
  logRendererBootstrap('window_error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  logRendererBootstrap('unhandled_rejection', {
    reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
  })
})

registerBuiltinPaneKinds()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
