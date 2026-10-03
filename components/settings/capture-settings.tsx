"use client"

import { BookmarkIcon } from "lucide-react"
import { useEffect, useRef } from "react"

/** Bookmarklet + share sheet instructions. */
export function CaptureSettings({ appUrl }: { appUrl: string }) {
  const linkRef = useRef<HTMLAnchorElement>(null)
  const code = `javascript:(()=>{const u=encodeURIComponent(location.href),t=encodeURIComponent(document.title);window.open('${appUrl}/capture?url='+u+'&title='+t,'resourcehub','width=420,height=360')})()`

  // React blocks javascript: URLs in href, so set it on the DOM node directly.
  useEffect(() => {
    linkRef.current?.setAttribute("href", code)
  }, [code])

  return (
    <div className="space-y-6 text-sm">
      <div className="space-y-2">
        <h3 className="font-medium">Bookmarklet</h3>
        <p className="text-text-muted">
          Drag this button to your bookmarks bar. Click it on any page to save
          it.
        </p>
        <a
          ref={linkRef}
          onClick={(e) => e.preventDefault()}
          draggable
          className="inline-flex h-9 cursor-grab items-center gap-2 rounded-lg bg-brand px-3 font-medium text-brand-fg shadow-glow active:cursor-grabbing"
        >
          <BookmarkIcon className="size-4" />
          Save to Hub
        </a>
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">Android share sheet</h3>
        <p className="text-text-muted">
          Open this site in Chrome on Android and choose <em>Install app</em>{" "}
          (or <em>Add to Home screen</em>). &ldquo;Resource Hub&rdquo; then
          appears in the system share sheet.
        </p>
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">iOS Shortcut</h3>
        <p className="text-text-muted">
          Safari doesn&apos;t support web share targets, so use a Shortcut:
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-text-muted">
          <li>Create a personal token below and copy it.</li>
          <li>
            In Shortcuts, create a new shortcut and enable{" "}
            <em>Show in Share Sheet</em> (accepts URLs and Text).
          </li>
          <li>
            Add <em>Get Contents of URL</em>: URL{" "}
            <code className="rounded bg-surface-raised px-1">
              {appUrl}/api/v1/capture
            </code>
            , method POST, header{" "}
            <code className="rounded bg-surface-raised px-1">
              Authorization: Bearer &lt;token&gt;
            </code>
            , request body JSON with field{" "}
            <code className="rounded bg-surface-raised px-1">url</code> set to{" "}
            <em>Shortcut Input</em>.
          </li>
          <li>
            Optionally add <em>Show Notification</em> &ldquo;Saved to
            Inbox&rdquo;.
          </li>
        </ol>
      </div>
    </div>
  )
}
