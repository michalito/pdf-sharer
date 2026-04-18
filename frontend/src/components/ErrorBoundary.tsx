import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] p-6">
        <div className="w-full max-w-sm rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-6 text-center shadow-lg">
          <AlertTriangle className="mx-auto h-10 w-10 text-[var(--danger)]" />
          <h1 className="mt-4 font-display text-lg font-semibold text-[var(--app-text)]">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-[var(--app-muted)]">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="pressable mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <RotateCcw className="h-4 w-4" />
            Reload
          </button>
        </div>
      </div>
    );
  }
}
