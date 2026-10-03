import { FolderIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** A project's emoji (if one was picked) or a colored folder as the fallback
 * — the one place that decides how a project is represented as an icon, so
 * every call site (sidebar, header, chips, pickers) stays in sync. */
export function ProjectIcon({
  icon,
  color,
  size = 16,
  className,
}: {
  icon?: string | null
  color?: string | null
  size?: number
  className?: string
}) {
  if (icon) {
    return (
      <span
        role="img"
        aria-hidden
        className={cn("inline-flex shrink-0 items-center justify-center leading-none", className)}
        style={{ fontSize: size, width: size, height: size }}
      >
        {icon}
      </span>
    )
  }
  return (
    <FolderIcon
      aria-hidden
      size={size}
      className={cn("shrink-0", className)}
      style={{ color: color ?? undefined }}
    />
  )
}
