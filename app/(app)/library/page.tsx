import type { Metadata } from "next"

import { LibraryView } from "@/components/resources/library-view"
import { getSettings } from "@/lib/server/dal/settings"
import { requireUser } from "@/lib/server/dal/session"

export const metadata: Metadata = { title: "Library" }

export default async function LibraryPage() {
  const user = await requireUser()
  const settings = await getSettings(user.id)
  return (
    <LibraryView
      title="Library"
      description="Everything you've saved, rendered and playable in place."
      initialSettings={settings}
      emptyTitle="Your library is empty"
      emptyDescription="Paste a YouTube, Instagram, X, GitHub or Pinterest link, any URL, a note, or drop a file."
    />
  )
}
