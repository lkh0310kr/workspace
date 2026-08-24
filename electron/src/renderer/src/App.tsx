import { TerminalPane } from './components/TerminalPane'
import { BrowserPane } from './components/BrowserPane'

// Placeholder shell for the milestone: prove node-pty+xterm.js and a
// <webview>-based browser pane both work side by side with no z-order
// fighting (the native-child-webview version had a documented z-order bug
// — a <webview> guest composites within the normal DOM stacking order,
// which is the whole reason to prefer it). Real layout (flexlayout-react,
// tabs, editor pane) gets ported in later steps.
function App(): React.JSX.Element {
  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#1e1e1e' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <TerminalPane />
      </div>
      <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid #3a3a3a' }}>
        <BrowserPane />
      </div>
    </div>
  )
}

export default App
