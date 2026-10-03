import { ListTodoIcon } from "lucide-react"
import type { Metadata } from "next"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Tasks" }

export default function TasksPage() {
  return (
    <>
      <PageHeader title="Tasks" />
      <EmptyState
        icon={ListTodoIcon}
        title="Tasks arrive in Phase 4"
        description={`List and board views, quick-add ("finish landing page friday 5pm #project !high"), checklists and linked resources.`}
      />
    </>
  )
}
