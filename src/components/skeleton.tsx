// Loading placeholders shown the moment a link is clicked, while the server renders the page.
// Neutral blocks only; the pulse is turned off for people who prefer reduced motion.

const Bar = ({ className = "" }: { className?: string }) => <span aria-hidden className={`block rounded-lg bg-[#e6ebe8] motion-safe:animate-pulse ${className}`} />;

/** Content area of a page inside a layout that already shows the header. */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-2">
        <Bar className="h-8 w-64 max-w-full" />
        <Bar className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="card flex flex-col gap-3 p-5">
            <Bar className="h-5 w-40" />
            <Bar className="h-3.5 w-full" />
            <Bar className="h-3.5 w-4/5" />
            <Bar className="mt-2 h-4 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A full page (for routes whose header is part of the page itself). */
export function FullPageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div>
      <div className="flex items-center justify-between border-b border-line bg-white px-6 py-3.5 sm:px-8">
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-brand text-[17px] font-extrabold text-white">M</span>
          <Bar className="h-4 w-24" />
        </span>
        <Bar className="h-4 w-40" />
      </div>
      <main className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6">
        <PageSkeleton cards={cards} />
      </main>
    </div>
  );
}
