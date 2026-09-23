/**
 * Per-section skeletons for the `/` page — used as <Suspense> fallbacks
 * in app/page.tsx while each section's server query streams in, and as
 * the client-side loading state when a section has no SSR seed.
 * Pure markup (no hooks) so they render on both sides.
 */

/** A horizontal row of shimmering card placeholders. */
export function CardsRowSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="flex w-48 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-stroke bg-card-bg shadow-sm sm:w-56"
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
  );
}

/** PDF card placeholders — flatter variant (no border/actions row). */
export function PdfCardsRowSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex w-48 shrink-0 flex-col sm:w-56">
          <div className="aspect-4/3 w-full animate-pulse rounded-xl bg-muted" />
          <div className="px-3 pt-2.5">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-muted/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Whole-section fallback: pulsing header bar + card row. */
export function SectionSkeleton() {
  return (
    <section className="mb-10">
      <div className="mb-4 h-6 w-40 animate-pulse rounded-lg bg-muted" />
      <CardsRowSkeleton />
    </section>
  );
}
