'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full p-8 rounded-xl border border-rose-900/50 bg-slate-900 shadow-2xl text-center">
          <h2 className="text-xl font-bold text-white mb-2">Critical System Failure</h2>
          <p className="text-sm text-slate-400 mb-6">
            A fatal error occurred in the core application shell.
          </p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
          >
            Reload Application
          </button>
        </div>
      </body>
    </html>
  );
}
