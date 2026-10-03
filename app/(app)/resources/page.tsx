import type { Metadata } from "next"

import { LibraryView } from "@/components/resources/library-view"
import { getSettings } from "@/lib/server/dal/settings"
import { requireUser } from "@/lib/server/dal/session"

export const metadata: Metadata = { title: "Resources" }

export default async function ResourcesPage(props: {
  searchParams: Promise<{ filter?: string }>
}) {
  const user = await requireUser()
  const settings = await getSettings(user.id)
  const searchParams = await props.searchParams
  return (
    <LibraryView
      title="Resources"
      description="Everything you've saved, rendered and playable in place."
      initialSettings={settings}
      independentFilter
      initialIndependent={searchParams.filter === "independent"}
      emptyTitle="Your resources are empty"
      emptyDescription="Paste a YouTube, Instagram, X, GitHub or Pinterest link, any URL, a note, or drop a file."
      emptyTitleIndependent="Inbox zero"
      emptyDescriptionIndependent="Anything you capture from the bookmarklet, share sheet or add dialog lands here first."
    />
  )
}
