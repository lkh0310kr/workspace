import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registerBuiltinPaneKinds } from './panes/builtinPaneKinds'

registerBuiltinPaneKinds()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
