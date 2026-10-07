import type { Metadata } from "next"
import { QuickNotesView } from "@/components/quick-notes/quick-notes-view"
export const metadata: Metadata = { title: "Docs" }
export default function DocsPage() {
  return <QuickNotesView />
}
