import { Component, type ErrorInfo, type ReactNode } from "react";
import { logError } from "../errorLog";

// Ported from the Tauri app's ui/src/components/ErrorBoundary.tsx (which
// replaced the *entire* app with a full-screen red error screen), adapted
// to wrap one pane at a time instead — this app now has multiple
// independent panes (PaneGroup.tsx) at once, so one crashing shouldn't
// take the whole window down with it. Also reports into errorLog.ts so
// the real message survives even though flexlayout's own outer error
// boundary would otherwise still swallow it behind "Error rendering
// component" for this pane's slot.
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class PaneErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(`${error.name}: ${error.message}`, `${error.stack}\n\n--- component stack ---\n${info.componentStack}`);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="pane-error-fallback">
          <div className="pane-error-fallback-title">
            {error.name}: {error.message}
          </div>
          <button type="button" onClick={() => this.setState({ error: null })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
