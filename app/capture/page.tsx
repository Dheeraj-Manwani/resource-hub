import type { Metadata } from "next"

import { CaptureClient } from "@/components/capture-client"
import { requireUser } from "@/lib/server/dal/session"

export const metadata: Metadata = { title: "Save to Inbox" }

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.slice(0, 50_000) ?? ""
}

/** Landing page for the PWA share target and the bookmarklet popup. */
export default async function CapturePage(props: PageProps<"/capture">) {
  await requireUser()
  const params = await props.searchParams
  return (
    <CaptureClient
      url={first(params.url)}
      text={first(params.text)}
      title={first(params.title)}
    />
  )
}
