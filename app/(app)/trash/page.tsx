import { Trash2Icon } from "lucide-react"
import type { Metadata } from "next"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Trash" }

export default function TrashPage() {
  return (
    <>
      <PageHeader title="Trash" />
      <EmptyState
        icon={Trash2Icon}
        title="Trash arrives in Phase 6"
        description="Deleted resources are soft-deleted today; restoring and emptying the trash come later."
      />
    </>
  )
}
