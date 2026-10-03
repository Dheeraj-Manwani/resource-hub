import { SearchIcon } from "lucide-react"
import type { Metadata } from "next"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Search" }

export default function SearchPage() {
  return (
    <>
      <PageHeader title="Search" />
      <EmptyState
        icon={SearchIcon}
        title="Search arrives in Phase 6"
        description="Full-text search across resources, tasks, projects and tags with highlighted matches."
      />
    </>
  )
}
