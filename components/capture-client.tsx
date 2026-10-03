"use client"

import { CheckCircle2Icon, Loader2Icon, TriangleAlertIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { LogoMark } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api-client"
import type { ResourceDto } from "@/lib/resources/dto"
import { displayTitle } from "@/lib/resources/dto"

type State =
  | { status: "saving" }
  | { status: "saved"; resource: ResourceDto; duplicate: boolean }
  | { status: "error"; message: string }

const URL_IN_TEXT = /\bhttps?:\/\/\S+/i

export function CaptureClient({
  url,
  text,
  title,
}: {
  url: string
  text: string
  title: string
}) {
  // Android shares often put the URL inside `text`.
  const sharedUrl = url || text.match(URL_IN_TEXT)?.[0] || ""
  const nothing = !sharedUrl && !text.trim()
  const [state, setState] = useState<State>(
    nothing
      ? { status: "error", message: "Nothing was shared." }
      : { status: "saving" }
  )
  const started = useRef(false)

  useEffect(() => {
    if (nothing || started.current) return
    started.current = true
    const shareTitle =
      title || (sharedUrl ? text.replace(sharedUrl, "").trim() : "")
    api<{ resource: ResourceDto; duplicate: boolean }>("/api/v1/capture", {
      method: "POST",
      body: sharedUrl
        ? { url: sharedUrl, title: shareTitle || undefined }
        : { text },
    })
      .then(({ resource, duplicate }) => {
        setState({ status: "saved", resource, duplicate })
        // Close the bookmarklet popup automatically.
        if (window.opener) window.setTimeout(() => window.close(), 1200)
      })
      .catch((error: Error) =>
        setState({ status: "error", message: error.message })
      )
  }, [nothing, sharedUrl, text, title])

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-card">
        <LogoMark className="mx-auto size-9" />
        {state.status === "saving" ? (
          <div className="mt-5 flex flex-col items-center gap-2">
            <Loader2Icon className="size-6 animate-spin text-brand" />
            <p className="text-sm text-text-muted">Saving to Inbox…</p>
          </div>
        ) : state.status === "saved" ? (
          <div className="mt-5 flex flex-col items-center gap-2">
            <CheckCircle2Icon className="size-7 text-emerald-400" />
            <p className="font-medium">
              {state.duplicate ? "Already in your hub" : "Saved to Inbox"}
            </p>
            <p className="line-clamp-2 text-sm text-text-muted">
              {displayTitle(state.resource)}
            </p>
            <Button
              className="mt-3"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/inbox?r=${state.resource.id}`} />}
            >
              Open
            </Button>
          </div>
        ) : (
          <div className="mt-5 flex flex-col items-center gap-2">
            <TriangleAlertIcon className="size-7 text-amber-400" />
            <p className="text-sm text-text-muted">{state.message}</p>
            <Button
              className="mt-3"
              variant="outline"
              nativeButton={false}
              render={<Link href="/inbox" />}
            >
              Go to Inbox
            </Button>
          </div>
        )}
      </div>
    </main>
  )
}
