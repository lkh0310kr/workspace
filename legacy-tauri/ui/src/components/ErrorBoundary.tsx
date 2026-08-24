import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    const { error, info } = this.state;
    if (error) {
      return (
        <pre
          style={{
            color: "#ff6b6b",
            background: "#1a0000",
            padding: "16px",
            margin: 0,
            width: "100vw",
            height: "100vh",
            overflow: "auto",
            fontSize: "12px",
            whiteSpace: "pre-wrap",
          }}
        >
          {error.name}: {error.message}
          {"\n\n"}
          {error.stack}
          {"\n\n--- component stack ---\n"}
          {info?.componentStack}
        </pre>
      );
    }
    return this.props.children;
  }
}
