'use client';

import { useEffect } from 'react';
import { createLogger } from '@/lib/logger';

const log = createLogger('DSMErrorBoundary');

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    log.error('DSM Error Boundary caught exception', error);
  }, [error]);

  return (
    <div className="w-full min-h-[60vh] flex flex-col items-center justify-center p-6 text-center bg-background text-foreground animate-in fade-in duration-300">
      <div className="max-w-md w-full p-8 rounded-2xl border border-rose-500/30 bg-card/90 shadow-2xl backdrop-blur-md">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 font-mono text-xl font-bold">
          !
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground mb-2">Telemetry Pipeline Disrupted</h2>
        <p className="text-sm text-muted-foreground mb-6">
          An unexpected error occurred while rendering solar operations.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm transition-colors cursor-pointer"
          >
            Retry Pipeline
          </button>
          <a
            href="/analytics"
            className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-sm font-medium transition-colors"
          >
            Mission Control
          </a>
        </div>
      </div>
    </div>
  );
}
