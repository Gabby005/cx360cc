/** Shown instantly while the next screen loads, so a click never feels like nothing happened. */
export default function Loading() {
  return (
    <div className="h-full overflow-hidden p-6 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-48 rounded bg-ink-950/10 dark:bg-surface/10 mb-2" />
      <div className="h-4 w-80 rounded bg-ink-950/5 dark:bg-surface/5 mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[72px] rounded-lg bg-ink-950/5 dark:bg-surface/5" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 2xl:grid-cols-9 gap-3 mb-6">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-[120px] rounded-lg bg-ink-950/5 dark:bg-surface/5" />
        ))}
      </div>
      <div className="h-64 rounded-lg bg-ink-950/5 dark:bg-surface/5" />
    </div>
  );
}
