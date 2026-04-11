"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary — catches render errors gracefully.
 *
 * Katie Dill: "You see a typo, then something isn't laid out correctly,
 * then you LOST YOUR WORK. Then you start to question everything."
 *
 * We never show a blank screen. We never lose user context.
 * Every error gets a graceful, trustworthy fallback.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-12 w-12 rounded-full bg-warning/10 flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6 text-warning" />
          </div>
          <h3 className="text-lg font-semibold text-text-1">
            Something went wrong
          </h3>
          <p className="mt-1 text-sm text-text-2 max-w-sm">
            An unexpected error occurred. Your data is safe — nothing was lost.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
