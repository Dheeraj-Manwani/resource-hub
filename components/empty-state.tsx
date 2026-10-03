import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong/70 px-6 py-16 text-center",
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Icon className="size-5" />
      </div>
      <h2 className="mt-4 text-base font-medium">{title}</h2>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-balance text-text-muted">
          {description}
        </p>
      ) : null}
      {children ? (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {children}
        </div>
      ) : null}
    </div>
  )
}
