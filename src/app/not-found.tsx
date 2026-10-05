import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full p-8 rounded-xl border border-slate-800 bg-slate-900/60 shadow-2xl backdrop-blur-md">
        <div className="text-4xl font-extrabold text-amber-500 font-mono mb-2">404</div>
        <h2 className="text-lg font-bold text-white mb-2">Solar Node Not Found</h2>
        <p className="text-sm text-slate-400 mb-6">
          The requested station, route, or telemetry telemetry endpoint does not exist.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm transition-colors"
        >
          Return to Mission Control
        </Link>
      </div>
    </div>
  );
}
