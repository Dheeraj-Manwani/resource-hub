"use client"

import { useQuery } from "@tanstack/react-query"
import { Command } from "cmdk"
import {
  CalendarDaysIcon,
  FolderIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LibraryBigIcon,
  ListPlusIcon,
  ListTodoIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { useShell } from "@/components/shell/shell-context"
import { TypeIcon } from "@/components/resources/type-icon"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"
import { api, toQueryString } from "@/lib/api-client"
import type { SearchResults } from "@/lib/server/dal/search"

const NAV_ACTIONS = [
  { label: "Overview", href: "/overview", icon: LayoutDashboardIcon },
  { label: "Library", href: "/library", icon: LibraryBigIcon },
  { label: "Inbox", href: "/inbox", icon: InboxIcon },
  { label: "Tasks", href: "/tasks", icon: ListTodoIcon },
  { label: "Calendar", href: "/calendar", icon: CalendarDaysIcon },
  { label: "Tags", href: "/tags", icon: TagIcon },
  { label: "Trash", href: "/trash", icon: Trash2Icon },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
]

/** Global `Cmd/Ctrl+K` command palette: quick search across everything plus
 * quick actions, mounted once in the app shell. Owns `Cmd/Ctrl+K` app-wide
 * (the Tasks page's own search input uses `/` only, see `tasks-view.tsx`). */
export function CommandPalette() {
  const { commandPaletteOpen: open, setCommandPaletteOpen: setOpen, openAddResource, openAddTask } =
    useShell()
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const router = useRouter()
  const { openResource, openTask } = useDetailDrawer()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, setOpen])

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 200)
    return () => clearTimeout(id)
  }, [query])

  const results = useQuery({
    queryKey: ["command-search", debounced],
    queryFn: ({ signal }) =>
      api<SearchResults>(`/api/v1/search${toQueryString({ q: debounced, limit: 6 })}`, {
        signal,
      }),
    enabled: open && debounced.length > 0,
  })

  function close() {
    setOpen(false)
    setQuery("")
    setDebounced("")
  }

  function go(fn: () => void) {
    fn()
    close()
  }

  const hasQuery = debounced.length > 0
  const data = results.data

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(v) => (v ? setOpen(true) : close())}
      shouldFilter={false}
      label="Command palette"
      overlayClassName="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
      contentClassName="fixed top-[15%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-border px-3">
        <SearchIcon className="size-4 shrink-0 text-subtle" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          autoFocus
          placeholder="Search everything, or jump to…"
          className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-subtle"
        />
      </div>
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="py-6 text-center text-sm text-subtle">
          {hasQuery ? "Nothing found" : "No matches"}
        </Command.Empty>

        {!hasQuery ? (
          <>
            <Command.Group heading="Quick actions" className="px-2 py-1.5 text-xs font-medium text-subtle [&_[cmdk-group-items]]:mt-1">
              <PaletteItem onSelect={() => go(() => openAddResource())}>
                <PlusIcon className="size-4 text-brand" />
                Add resource
              </PaletteItem>
              <PaletteItem onSelect={() => go(() => openAddTask())}>
                <ListPlusIcon className="size-4 text-brand" />
                Add task
              </PaletteItem>
            </Command.Group>
            <Command.Group heading="Go to" className="px-2 py-1.5 text-xs font-medium text-subtle [&_[cmdk-group-items]]:mt-1">
              {NAV_ACTIONS.map(({ label, href, icon: Icon }) => (
                <PaletteItem key={href} onSelect={() => go(() => router.push(href))}>
                  <Icon className="size-4 text-subtle" />
                  {label}
                </PaletteItem>
              ))}
            </Command.Group>
          </>
        ) : (
          <>
            {data?.resources.length ? (
              <Command.Group heading="Resources" className="px-2 py-1.5 text-xs font-medium text-subtle [&_[cmdk-group-items]]:mt-1">
                {data.resources.map((hit) => (
                  <PaletteItem key={hit.id} onSelect={() => go(() => openResource(hit.id))}>
                    {hit.resourceType ? (
                      <TypeIcon type={hit.resourceType} className="size-4" />
                    ) : (
                      <FolderIcon className="size-4 text-subtle" />
                    )}
                    <span className="truncate">{hit.title}</span>
                  </PaletteItem>
                ))}
              </Command.Group>
            ) : null}
            {data?.tasks.length ? (
              <Command.Group heading="Tasks" className="px-2 py-1.5 text-xs font-medium text-subtle [&_[cmdk-group-items]]:mt-1">
                {data.tasks.map((hit) => (
                  <PaletteItem key={hit.id} onSelect={() => go(() => openTask(hit.id))}>
                    <ListTodoIcon className="size-4 text-subtle" />
                    <span className="truncate">{hit.title}</span>
                  </PaletteItem>
                ))}
              </Command.Group>
            ) : null}
            {data?.projects.length ? (
              <Command.Group heading="Projects" className="px-2 py-1.5 text-xs font-medium text-subtle [&_[cmdk-group-items]]:mt-1">
                {data.projects.map((hit) => (
                  <PaletteItem
                    key={hit.id}
                    onSelect={() => go(() => router.push(`/projects/${hit.id}`))}
                  >
                    <FolderIcon className="size-4 text-subtle" />
                    <span className="truncate">{hit.title}</span>
                  </PaletteItem>
                ))}
              </Command.Group>
            ) : null}
            {data?.tags.length ? (
              <Command.Group heading="Tags" className="px-2 py-1.5 text-xs font-medium text-subtle [&_[cmdk-group-items]]:mt-1">
                {data.tags.map((hit) => (
                  <PaletteItem key={hit.id} onSelect={() => go(() => router.push("/tags"))}>
                    <TagIcon className="size-4 text-subtle" />
                    <span className="truncate">{hit.title}</span>
                  </PaletteItem>
                ))}
              </Command.Group>
            ) : null}
            <Command.Group className="px-2 py-1.5">
              <PaletteItem
                onSelect={() =>
                  go(() => router.push(`/search${toQueryString({ q: debounced })}`))
                }
              >
                <SearchIcon className="size-4 text-brand" />
                Full search for &ldquo;{debounced}&rdquo;
              </PaletteItem>
            </Command.Group>
          </>
        )}
      </Command.List>
    </Command.Dialog>
  )
}

function PaletteItem({
  children,
  onSelect,
}: {
  children: React.ReactNode
  onSelect: () => void
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-foreground outline-none data-[selected=true]:bg-brand-soft"
    >
      {children}
    </Command.Item>
  )
}
