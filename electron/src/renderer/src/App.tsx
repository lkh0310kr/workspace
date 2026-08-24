import { TerminalPane } from './components/TerminalPane'

// Placeholder shell for the milestone: prove node-pty + xterm.js works
// end-to-end through Electron IPC. Real layout (flexlayout-react, tabs,
// editor/browser panes) gets ported in later steps.
function App(): React.JSX.Element {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1e1e1e' }}>
      <TerminalPane />
    </div>
  )
}

export default App
