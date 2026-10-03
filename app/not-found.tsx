import { CompassIcon } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <EmptyState
        icon={CompassIcon}
        title="Page not found"
        description="That page doesn't exist or was moved."
        className="w-full max-w-md"
      >
        <Button nativeButton={false} render={<Link href="/overview" />}>
          Back to overview
        </Button>
      </EmptyState>
    </main>
  )
}
