import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const HEIGHTS = [220, 300, 180, 260, 340, 200, 280, 240]

export function CardGridSkeleton({
  count = 8,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        "columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4",
        className
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="mb-4 break-inside-avoid rounded-xl border border-border bg-card p-3"
        >
          <Skeleton
            className="w-full rounded-lg"
            style={{ height: HEIGHTS[i % HEIGHTS.length]! * 0.6 }}
          />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export function ListSkeleton({
  rows = 8,
  className,
}: {
  rows?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col divide-y divide-border rounded-xl border border-border",
        className
      )}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="size-10 rounded-md" />
          <div className="flex-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-72" />
      <CardGridSkeleton className="mt-8" count={6} />
    </div>
  )
}
