"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ApiClientError } from "@/lib/api-client"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, error) =>
              !(error instanceof ApiClientError && error.status < 500) &&
              count < 2,
          },
        },
      })
  )
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delay={300}>{children}</TooltipProvider>
      <Toaster position="bottom-right" closeButton />
    </QueryClientProvider>
  )
}
