import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Button } from "./Button";
import { logger } from "../../utils/logger";
import "./ErrorBoundary.css";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
    logger.error("ErrorBoundary", "system", "Uncaught error", {
      message: error.message,
      componentStack: info.componentStack?.slice(0, 500),
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary__card">
            <h2 className="error-boundary__title">Something went wrong</h2>
            <p className="error-boundary__message">
              The app encountered an unexpected error. You can try recovering or reload
              the app.
            </p>
            {this.state.error && (
              <pre className="error-boundary__details">{this.state.error.message}</pre>
            )}
            <div className="error-boundary__actions">
              <Button variant="secondary" onClick={this.handleReset}>
                Try Again
              </Button>
              <Button onClick={this.handleReload}>Reload App</Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
