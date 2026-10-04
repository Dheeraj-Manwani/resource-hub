"use client"

import { XIcon } from "lucide-react"
import toast, { ToastBar, Toaster as HotToaster } from "react-hot-toast"

export function Toaster() {
  return (
    <HotToaster
      position="bottom-right"
      containerStyle={{ zIndex: 10000 }}
      toastOptions={{
        duration: 4000,
        style: {
          background: "var(--popover)",
          color: "var(--popover-foreground)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          maxWidth: "min(420px, calc(100vw - 32px))",
          overflowWrap: "anywhere",
        },
        success: { duration: 3000 },
        error: { duration: 6000 },
        loading: { duration: Infinity },
      }}
    >
      {(t) => (
        <ToastBar toast={t}>
          {({ icon, message }) => (
            <>
              {icon}
              {message}
              {t.type !== "loading" && (
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={() => toast.dismiss(t.id)}
                  className="shrink-0 rounded p-1 text-text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <XIcon className="size-4" />
                </button>
              )}
            </>
          )}
        </ToastBar>
      )}
    </HotToaster>
  )
}
