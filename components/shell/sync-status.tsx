"use client"

import {
  AlertCircleIcon,
  CheckIcon,
  LoaderCircleIcon,
  WifiOffIcon,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { useSyncController, useSyncStore } from "@/components/sync-provider"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { getSyncSummary } from "@/lib/sync/store"
import { cn } from "@/lib/utils"

export function SyncStatus({ className }: { className?: string }) {
  const controller = useSyncController()
  const state = useSyncStore((state) => state)
  const [now, setNow] = useState(() => Date.now())
  const summary = getSyncSummary(state, now)
  const spinning = summary.active.find(
    (op) => op.phase === "writing" || op.phase === "reconciling"
  )
  const spinnerKey = spinning
    ? `${spinning.id}:${spinning.startedAt}`
    : undefined
  const [visibleSpinner, setVisibleSpinner] = useState<string>()
  useEffect(() => {
    if (!spinnerKey) return
    const timer = setTimeout(() => setVisibleSpinner(spinnerKey), 200)
    return () => clearTimeout(timer)
  }, [spinnerKey])
  const ticking =
    summary.isSyncing ||
    !!(state.lastSavedAt && now - state.lastSavedAt < 2_000)
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [ticking])

  const Icon =
    !state.online && summary.isSyncing
      ? WifiOffIcon
      : summary.failures.length
        ? AlertCircleIcon
        : summary.isSyncing
          ? LoaderCircleIcon
          : CheckIcon

  return (
    <div className={cn("min-h-8", className)}>
      {/* Keep the live region mounted so changes are announced without focus. */}
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {summary.text}
      </span>
      {summary.text ? (
        <Popover>
          <PopoverTrigger
            className="flex min-h-8 w-full items-center gap-2 rounded-md px-3 text-left text-xs text-text-muted hover:bg-white/[0.04]"
            aria-label={`${summary.text}. View sync details`}
          >
            <Icon
              aria-hidden
              className={cn(
                "size-3.5 shrink-0",
                summary.isSyncing &&
                  state.online &&
                  !summary.failures.length &&
                  "animate-spin motion-reduce:animate-none",
                summary.isSyncing &&
                  state.online &&
                  !summary.failures.length &&
                  (visibleSpinner !== spinnerKey || !spinnerKey) &&
                  "opacity-0"
              )}
            />
            <span>{summary.text}</span>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            className="w-80 max-w-[calc(100vw-2rem)] p-3"
          >
            <PopoverTitle>Sync status</PopoverTitle>
            <p className="text-xs text-text-muted">
              {!state.online
                ? "You're offline. Paused saves resume when you reconnect while this tab stays open. Failed uploads and changes need review."
                : summary.slow
                  ? "This is taking longer than usual. Your change is still pending."
                  : summary.isSyncing
                    ? "Saving your changes and updating the view."
                    : summary.failures.length
                      ? "Some changes need your attention."
                      : "Your changes have been saved."}
            </p>
            <ul className="max-h-72 space-y-3 overflow-y-auto">
              {[...summary.active, ...summary.failures].map((operation) => (
                <li
                  key={operation.id}
                  className="space-y-1 border-t border-border pt-2"
                >
                  <p className="text-xs font-medium">{operation.label}</p>
                  <p className="text-xs text-text-muted">
                    {operation.message ??
                      (operation.phase === "queued"
                        ? "Waiting to save…"
                        : operation.phase === "paused"
                          ? "Waiting to sync…"
                          : operation.phase === "reconciling"
                            ? "Saved; updating the view…"
                            : "Saving…")}
                  </p>
                  {summary.failures.includes(operation) ? (
                    <div className="flex items-center gap-2">
                      {operation.canRetry ? (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => void controller.retry(operation.id)}
                        >
                          Retry
                        </Button>
                      ) : null}
                      {operation.href ? (
                        <Link
                          href={operation.href}
                          className="text-xs underline"
                        >
                          Review
                        </Link>
                      ) : null}
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => controller.dismiss(operation.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}
