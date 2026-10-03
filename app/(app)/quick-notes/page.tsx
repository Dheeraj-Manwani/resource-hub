import type { Metadata } from "next"

import { QuickNotesView } from "@/components/quick-notes/quick-notes-view"

export const metadata: Metadata = { title: "Quick Notes" }

export default function QuickNotesPage() {
  return <QuickNotesView />
}
