export default function StorefrontLoading() {
  return (
    <div className="sf-page" role="status" aria-label="Loading club page">
      <span className="sr-only">Loading your club page…</span><div aria-hidden="true" className="sf-container grid gap-8 lg:grid-cols-2 lg:items-center">
        <div><div className="h-3 w-36 animate-pulse bg-[var(--sf-secondary)]" /><div className="mt-7 h-16 w-full max-w-xl animate-pulse bg-[var(--sf-secondary)]" /><div className="mt-3 h-16 w-4/5 max-w-lg animate-pulse bg-[var(--sf-secondary)]" /><div className="mt-7 h-6 w-full max-w-md animate-pulse bg-[var(--sf-secondary)]" /><div className="mt-10 h-12 w-44 animate-pulse bg-[var(--sf-secondary)]" /></div>
        <div className="h-[48dvh] min-h-80 animate-pulse border border-[var(--sf-border)] bg-[var(--sf-secondary)]" />
      </div>
    </div>
  );
}
