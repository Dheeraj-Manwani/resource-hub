import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { TasksView } from "@/components/tasks/tasks-view"

export const metadata: Metadata = { title: "Tasks" }

export default function TasksPage() {
  return (
    <>
      <PageHeader title="Tasks" />
      <Suspense>
        <TasksView />
      </Suspense>
    </>
  )
}
