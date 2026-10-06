"use client"

import { useShell } from "@/components/shell/shell-context"
import { PageHeader } from "@/components/page-header"

import { PendingCreations } from "@/components/pending-creations"

import { QueryFeedback } from "@/components/query-feedback"

import {
  CheckSquareIcon,
  KanbanSquareIcon,
  ListIcon,
  Loader2Icon,
  SearchIcon,
  PlusIcon,
  FileExclamationPoint,
  XIcon,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useTaskList, type TaskFilters } from "@/hooks/queries/tasks"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from "@/lib/tasks/types"
import type { SmartFilter } from "@/lib/validation/tasks"

import { QuickAddBar } from "./quick-add-bar"
import { TaskBoard } from "./task-board"
import { TaskBulkActionBar } from "./task-bulk-action-bar"
import { TaskList, type TaskGroupBy } from "./task-list"

type View = "list" | "board"
const ALL = "__all"

type SortKey = "manual" | "due" | "priority" | "title" | "created"
const SORTS: Record<
  SortKey,
  { label: string; sort: TaskFilters["sort"]; order: TaskFilters["order"] }
> = {
  manual: { label: "Manual order", sort: "sortKey", order: "asc" },
  due: { label: "Due date", sort: "due", order: "asc" },
  priority: { label: "Priority", sort: "priority", order: "desc" },
  title: { label: "Title A–Z", sort: "title", order: "asc" },
  created: { label: "Newest first", sort: "created", order: "desc" },
}

const SMART_FILTER_LABELS: Record<SmartFilter, string> = {
  today: "Today",
  upcoming: "Upcoming",
  overdue: "Overdue",
  no_date: "No date",
  completed: "Completed",
}

function isTypingTarget(el: EventTarget | null) {
  const node = el as HTMLElement | null
  return (
    !!node &&
    (node.tagName === "INPUT" ||
      node.tagName === "TEXTAREA" ||
      node.isContentEditable)
  )
}

export function TasksView() {
  const { openAddTask } = useShell()
  const router = useRouter()
  const searchParams = useSearchParams()
  const smartFilter =
    (searchParams.get("smartFilter") as SmartFilter | null) ?? undefined
  const { openTask } = useDetailDrawer()

  const [view, setView] = useState<View>("list")
  const [groupBy, setGroupBy] = useState<TaskGroupBy>("status")
  const [sortKey, setSortKey] = useState<SortKey>("manual")
  const [status, setStatus] = useState<string | undefined>()
  const [priority, setPriority] = useState<string | undefined>()
  const [titleFilter, setTitleFilter] = useState("")
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)

  const filters: TaskFilters = useMemo(
    () => ({
      smartFilter,
      status: status as TaskFilters["status"],
      priority: priority as TaskFilters["priority"],
      sort: view === "board" ? "sortKey" : SORTS[sortKey].sort,
      order: view === "board" ? "asc" : SORTS[sortKey].order,
    }),
    [smartFilter, status, priority, view, sortKey]
  )
  const query = useTaskList(filters)
  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data]
  )
  const filteredItems = titleFilter.trim()
    ? items.filter((t) =>
        t.title.toLowerCase().includes(titleFilter.trim().toLowerCase())
      )
    : items

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  let body: React.ReactNode
  if (query.isPending) {
    body = (
      <div className="space-y-3 py-4" aria-label="Loading tasks">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-14 w-full" />
        ))}
      </div>
    )
  } else if (query.isError && !query.data) {
    body = null
  } else if (!filteredItems.length) {
    body = (
      <EmptyState
        icon={FileExclamationPoint}
        title={
          smartFilter
            ? `No ${SMART_FILTER_LABELS[smartFilter].toLowerCase()} tasks`
            : "No tasks yet"
        }
        description={
          smartFilter
            ? "Nothing matches this filter right now."
            : "Try the quick-add bar above — type a title, add #project, !priority or a due date."
        }
      />
    )
  } else if (view === "board") {
    body = <TaskBoard items={filteredItems} onOpen={openTask} />
  } else {
    body = (
      <TaskList
        items={filteredItems}
        groupBy={groupBy}
        onOpen={openTask}
        selectable={selectMode}
        selected={selected}
        onToggleSelect={toggleSelected}
      />
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tasks"
        actions={
          <Button size="sm" onClick={() => openAddTask()}>
            <PlusIcon />
            Add task
          </Button>
        }
      />
      <QuickAddBar autoFocus={false} />

      {smartFilter ? (
        <div className="flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-1.5 text-sm text-foreground">
          {SMART_FILTER_LABELS[smartFilter]}
          <button
            type="button"
            aria-label="Clear filter"
            onClick={() => router.push("/tasks")}
            className="ml-auto rounded p-0.5 hover:bg-white/10"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input
            ref={searchRef}
            value={titleFilter}
            onChange={(e) => setTitleFilter(e.target.value)}
            placeholder="Filter by title… (/)"
            className="h-7 w-44 pl-7 text-xs"
          />
        </div>

        <Select
          value={status ?? ALL}
          onValueChange={(v: string | null) =>
            setStatus(!v || v === ALL ? undefined : v)
          }
        >
          <SelectTrigger size="sm" aria-label="Filter by status">
            <SelectValue>
              {(v: string) =>
                v === ALL
                  ? "All statuses"
                  : TASK_STATUS_LABELS[v as keyof typeof TASK_STATUS_LABELS]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={priority ?? ALL}
          onValueChange={(v: string | null) =>
            setPriority(!v || v === ALL ? undefined : v)
          }
        >
          <SelectTrigger size="sm" aria-label="Filter by priority">
            <SelectValue>
              {(v: string) =>
                v === ALL
                  ? "All priorities"
                  : TASK_PRIORITY_LABELS[v as keyof typeof TASK_PRIORITY_LABELS]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All priorities</SelectItem>
            {TASK_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          {view === "list" ? (
            <>
              <Select
                value={sortKey}
                onValueChange={(v) => setSortKey(v as SortKey)}
              >
                <SelectTrigger size="sm" aria-label="Sort">
                  <SelectValue>
                    {(v: string) => SORTS[v as SortKey].label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="end">
                  {(Object.keys(SORTS) as SortKey[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {SORTS[key].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={groupBy}
                onValueChange={(v) => setGroupBy(v as TaskGroupBy)}
              >
                <SelectTrigger size="sm" aria-label="Group by">
                  <SelectValue>
                    {(v: string) => `Group: ${v === "none" ? "none" : v}`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="end">
                  {(
                    [
                      "none",
                      "status",
                      "project",
                      "due",
                      "priority",
                    ] as TaskGroupBy[]
                  ).map((g) => (
                    <SelectItem key={g} value={g}>
                      {g === "none" ? "No grouping" : `By ${g}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : null}
          <Button
            size="sm"
            variant={selectMode ? "default" : "outline"}
            aria-pressed={selectMode}
            onClick={() => {
              setSelectMode((v) => !v)
              setSelected(new Set())
            }}
          >
            <CheckSquareIcon />
            Select
          </Button>
          <ToggleGroup
            value={[view]}
            onValueChange={(values: string[]) => {
              const next = values[0] as View | undefined
              if (next) setView(next)
            }}
            variant="outline"
            size="sm"
            aria-label="View"
          >
            <ToggleGroupItem value="list" aria-label="List" title="List">
              <ListIcon />
            </ToggleGroupItem>
            <ToggleGroupItem value="board" aria-label="Board" title="Board">
              <KanbanSquareIcon />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <QueryFeedback query={query} label="tasks" loading={false} />
      <PendingCreations entity="task" filters={filters} />
      {body}

      {view === "list" && hasNextPage ? (
        <div className="flex justify-center py-4">
          <Button
            variant="ghost"
            size="sm"
            disabled={isFetchingNextPage}
            onClick={loadMore}
          >
            {isFetchingNextPage ? (
              <Loader2Icon className="animate-spin" />
            ) : null}
            Load more
          </Button>
        </div>
      ) : null}

      {selectMode ? (
        <TaskBulkActionBar
          selectedIds={[...selected]}
          onClear={() => setSelected(new Set())}
        />
      ) : null}
    </div>
  )
}
