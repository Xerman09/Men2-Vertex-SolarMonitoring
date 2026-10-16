import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="w-full min-h-[60vh] flex flex-col items-center justify-center p-6 text-center bg-background text-foreground animate-in fade-in duration-300">
      <div className="max-w-md w-full p-8 rounded-2xl border border-border/80 bg-card/90 shadow-2xl backdrop-blur-md">
        <div className="text-4xl font-extrabold text-primary font-mono mb-2">404</div>
        <h2 className="text-lg font-bold text-foreground mb-2">Solar Node Not Found</h2>
        <p className="text-sm text-muted-foreground mb-6">
          The requested station, route, or telemetry endpoint does not exist.
        </p>
        <Link
          href="/analytics"
          className="inline-block px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm transition-colors"
        >
          Return to Mission Control
        </Link>
      </div>
    </div>
  );
}
