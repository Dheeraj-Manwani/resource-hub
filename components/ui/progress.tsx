"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import { cn } from "cn"

function Progress({ ...props }: ProgressPrimitive.Root.Props) {
  return <ProgressPrimitive.Root data-slot="progress" {...props} />
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      data-slot="progress-track"
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]",
        className
      )}
      {...props}
    />
  )
}

function ProgressIndicator({
  className,
  ...props
}: ProgressPrimitive.Indicator.Props) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn(
        "absolute inset-y-0 start-0 rounded-full bg-brand transition-[width] duration-300 ease-out-soft",
        className
      )}
      {...props}
    />
  )
}

export { Progress, ProgressIndicator, ProgressTrack }
