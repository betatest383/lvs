import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Error boundary for the calendar route.
 * A calendar error must NOT blank the entire LVC OS application.
 */
export default class CalendarErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[CALENDAR ERROR BOUNDARY]', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground mb-3" />
          <h3 className="font-semibold text-lg mb-1">Calendar Error</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            Something went wrong while loading the calendar. The rest of the application is unaffected.
          </p>
          <p className="text-xs text-muted-foreground/70 mb-4 font-mono">
            {this.state.error?.message || 'Unknown error'}
          </p>
          <Button onClick={this.handleRetry} variant="outline">
            <RefreshCw className="w-4 h-4 mr-1" /> Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}