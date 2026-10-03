"use client"

import { XIcon } from "lucide-react"
import { useDeferredValue, useId, useState } from "react"

import { useTagSearch } from "@/hooks/queries/resources"
import { cn } from "@/lib/utils"

/** Chips + autocomplete; Enter/comma adds, Backspace removes the last tag. */
export function TagInput({
  value,
  onChange,
  placeholder = "Add tags…",
  className,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  className?: string
}) {
  const [draft, setDraft] = useState("")
  const [focused, setFocused] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const deferred = useDeferredValue(draft.trim())
  const listId = useId()
  const { data: suggestions = [] } = useTagSearch(deferred)
  const lower = new Set(value.map((t) => t.toLowerCase()))
  const options = suggestions
    .filter((s) => !lower.has(s.name.toLowerCase()))
    .slice(0, 6)

  function add(name: string) {
    const clean = name.trim().replace(/^#/, "").replace(/,+$/, "")
    if (!clean || lower.has(clean.toLowerCase()) || value.length >= 20) return
    onChange([...value, clean.slice(0, 50)])
    setDraft("")
    setHighlight(0)
  }

  const open = focused && options.length > 0

  return (
    <div className={cn("relative", className)}>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 focus-within:border-brand/60 focus-within:ring-3 focus-within:ring-brand/20">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-6 items-center gap-1 rounded-full bg-brand-soft pr-1 pl-2 text-xs text-foreground"
          >
            #{tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="rounded-full p-0.5 text-text-muted hover:bg-white/10 hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const next = e.target.value
            if (next.endsWith(",")) add(next)
            else {
              setDraft(next)
              setHighlight(0)
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            if (draft.trim()) add(draft)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              if (open && options[highlight]) add(options[highlight].name)
              else add(draft)
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1))
            } else if (e.key === "ArrowDown" && open) {
              e.preventDefault()
              setHighlight((h) => (h + 1) % options.length)
            } else if (e.key === "ArrowUp" && open) {
              e.preventDefault()
              setHighlight((h) => (h - 1 + options.length) % options.length)
            }
          }}
          placeholder={value.length ? "" : placeholder}
          aria-label="Tags"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
        />
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-popover"
        >
          {options.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault()
                add(o.name)
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "cursor-pointer rounded-md px-2 py-1.5 text-sm",
                i === highlight && "bg-accent"
              )}
            >
              #{o.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
