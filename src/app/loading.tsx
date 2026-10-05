export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="relative flex items-center justify-center mb-6">
        <div className="w-16 h-16 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
        <div className="absolute w-8 h-8 rounded-full border-2 border-emerald-500/20 border-b-emerald-500 animate-spin" style={{ animationDirection: 'reverse' }} />
      </div>
      <h2 className="text-lg font-semibold tracking-wide text-slate-200">Synchronizing Telemetry...</h2>
      <p className="text-xs text-slate-400 mt-1 font-mono">DSM Inverter Matrix • Substation Operations</p>
    </div>
  );
}
