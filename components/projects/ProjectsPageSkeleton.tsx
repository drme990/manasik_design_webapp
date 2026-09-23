/**
 * Static skeleton for the projects page — used as the <Suspense> fallback
 * in app/page.tsx while the server-side designs query streams in.
 * Markup mirrors the real page chrome (title bar + card row) so the swap
 * is seamless.
 */
export default function ProjectsPageSkeleton() {
  return (
    <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
          <div className="mt-2 h-5 w-72 animate-pulse rounded-lg bg-muted/70" />
        </div>
        <section className="mb-10">
          <div className="mb-4 h-6 w-40 animate-pulse rounded-lg bg-muted" />
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none [&::-webkit-scrollbar]:hidden">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="flex w-48 shrink-0 flex-col overflow-hidden rounded-2xl border border-stroke bg-card-bg shadow-sm sm:w-56"
              >
                <div className="relative aspect-4/3 w-full overflow-hidden rounded-t-2xl">
                  <div className="h-full w-full animate-pulse bg-muted" />
                </div>
                <div className="px-3 pt-2.5">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-muted/70" />
                </div>
                <div className="flex w-full items-center gap-1 px-2.5 pb-2.5 pt-2">
                  <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
                  <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
                  <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
