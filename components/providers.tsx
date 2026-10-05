"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createAppQueryClient } from "@/lib/query-client"
import { MetadataProgress } from "@/components/metadata-progress"
import { SyncController } from "@/lib/sync/controller"
import { SyncProvider } from "@/components/sync-provider"

export function Providers({ children }: { children: React.ReactNode }) {
  const [sync] = useState(() => new SyncController())
  const [queryClient] = useState(() => createAppQueryClient(sync))
  return (
    <QueryClientProvider client={queryClient}>
      <SyncProvider controller={sync}>
        <TooltipProvider delay={300}>{children}</TooltipProvider>
        <MetadataProgress />
        <Toaster />
      </SyncProvider>
    </QueryClientProvider>
  )
}
