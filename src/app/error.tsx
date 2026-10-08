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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full p-8 rounded-xl border border-rose-900/40 bg-slate-900/80 shadow-2xl backdrop-blur-md">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-400 font-mono text-xl">
          !
        </div>
        <h2 className="text-xl font-bold tracking-tight text-white mb-2">Telemetry Pipeline Disrupted</h2>
        <p className="text-sm text-slate-400 mb-6">
          An unexpected error occurred while rendering solar operations.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
          >
            Retry Pipeline
          </button>
          <a
            href="/"
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors"
          >
            Mission Control
          </a>
        </div>
      </div>
    </div>
  );
}
