import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, ChevronDown } from 'lucide-react';

/**
 * Lightweight error boundary that catches render crashes in child components.
 * Shows a user-friendly message with admin-expandable technical details.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
  };

  render() {
    if (this.state.hasError) {
      const { message = 'Something went wrong loading this section.' } = this.props;
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">{message}</p>
              <p className="text-xs text-muted-foreground">
                This section failed to load. You can try again or contact support.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={this.handleReset}>
              <RefreshCw className="w-3.5 h-3.5" /> Try Again
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-xs"
              onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${this.state.showDetails ? 'rotate-180' : ''}`} />
              Technical Details
            </Button>
          </div>
          {this.state.showDetails && (
            <div className="rounded border bg-muted/50 p-2 text-xs font-mono text-muted-foreground overflow-x-auto">
              <p className="font-semibold mb-1">Error:</p>
              <pre className="whitespace-pre-wrap break-all">{this.state.error?.message || String(this.state.error)}</pre>
              {this.state.errorInfo?.componentStack && (
                <>
                  <p className="font-semibold mt-2 mb-1">Component Stack:</p>
                  <pre className="whitespace-pre-wrap break-all">{this.state.errorInfo.componentStack}</pre>
                </>
              )}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}