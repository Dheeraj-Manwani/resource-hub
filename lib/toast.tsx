"use client"

import toast, { type ToastOptions } from "react-hot-toast"

type MessageOptions = ToastOptions & {
  description?: string
  action?: { label: string; onClick: () => void | Promise<unknown> }
}

/** Rich messages keep descriptions and Undo actions inside a native toast. */
export function showToast(
  message: string,
  { description, action, ...options }: MessageOptions,
  type: "blank" | "success" = "blank"
) {
  const render = type === "success" ? toast.success : toast
  return render(
    (t) => (
      <div className="flex min-w-0 items-center gap-3 text-sm">
        <div className="min-w-0">
          <p className="font-medium">{message}</p>
          {description && (
            <p className="mt-1 text-xs text-text-muted">{description}</p>
          )}
        </div>
        {action && (
          <button
            type="button"
            className="shrink-0 rounded px-2 py-1 font-medium text-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => {
              toast.dismiss(t.id)
              void action.onClick()
            }}
          >
            {action.label}
          </button>
        )}
      </div>
    ),
    { ...(action ? { duration: 6000 } : {}), ...options }
  )
}
