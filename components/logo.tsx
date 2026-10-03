import { cn } from "@/lib/utils"

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-7 shrink-0", className)}
    >
      <rect width="32" height="32" rx="8" fill="#FF6A00" />
      <rect x="7" y="8" width="11" height="16" rx="2.5" fill="#0A0A0A" />
      <rect
        x="20"
        y="8"
        width="5"
        height="7"
        rx="2"
        fill="#0A0A0A"
        opacity="0.75"
      />
      <rect
        x="20"
        y="17"
        width="5"
        height="7"
        rx="2"
        fill="#0A0A0A"
        opacity="0.5"
      />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">
        Resource Hub
      </span>
    </span>
  )
}
