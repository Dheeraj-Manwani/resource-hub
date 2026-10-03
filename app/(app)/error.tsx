"use client"

import { TriangleAlertIcon } from "lucide-react"
import { useEffect } from "react"

import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <EmptyState
      icon={TriangleAlertIcon}
      title="Something went wrong"
      description="This page hit an unexpected error. Your data is safe; try again."
    >
      <Button onClick={reset}>Try again</Button>
    </EmptyState>
  )
}
