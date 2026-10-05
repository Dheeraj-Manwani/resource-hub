"use client"

import { QueryFeedback } from "@/components/query-feedback"

import {
  LoaderCircleIcon,
  FolderIcon,
  ListTodoIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { TypeIcon } from "@/components/resources/type-icon"
import { Button } from "@/components/ui/button"
import {
  useEmptyTrash,
  usePermanentlyDelete,
  useRestoreFromTrash,
  useTrash,
} from "@/hooks/queries/trash"
import { formatRelative } from "@/lib/format"
import type { TrashEntityType, TrashItem } from "@/lib/server/dal/trash"

const SECTIONS: { key: TrashEntityType; label: string }[] = [
  { key: "resource", label: "Resources" },
  { key: "task", label: "Tasks" },
  { key: "project", label: "Projects" },
]

function Row({ item }: { item: TrashItem }) {
  const restore = useRestoreFromTrash()
  const permanentlyDelete = usePermanentlyDelete()
  const [confirming, setConfirming] = useState(false)

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      {item.entityType === "resource" && item.resourceType ? (
        <TypeIcon type={item.resourceType} />
      ) : item.entityType === "task" ? (
        <ListTodoIcon className="size-3.5 shrink-0 text-subtle" />
      ) : (
        <FolderIcon className="size-3.5 shrink-0 text-subtle" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
      <span className="shrink-0 text-xs text-subtle">
        Deleted {formatRelative(item.deletedAt)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={restore.isPending ? "Restoring item" : "Restore"}
        disabled={restore.isPending || permanentlyDelete.isPending}
        onClick={() =>
          restore.mutate({ entityType: item.entityType, id: item.id })
        }
      >
        {restore.isPending ? (
          <LoaderCircleIcon
            aria-hidden
            className="animate-spin motion-reduce:animate-none"
          />
        ) : (
          <RotateCcwIcon />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete forever"
        disabled={restore.isPending || permanentlyDelete.isPending}
        onClick={() => setConfirming(true)}
      >
        <Trash2Icon />
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete "${item.title}" forever?`}
        description="This can't be undone. Any uploaded files are removed from storage too."
        confirmLabel="Delete forever"
        onConfirm={() =>
          permanentlyDelete.mutateAsync({
            entityType: item.entityType,
            id: item.id,
          })
        }
      />
    </li>
  )
}

export function TrashView() {
  const trashQuery = useTrash()
  const { data: items = [], isPending } = trashQuery
  const emptyTrash = useEmptyTrash()
  const [confirmingEmpty, setConfirmingEmpty] = useState(false)

  return (
    <>
      <PageHeader
        title="Trash"
        description="Deleted resources, tasks and projects, purged automatically after 30 days."
        actions={
          items.length ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmingEmpty(true)}
            >
              <Trash2Icon />
              Empty Trash
            </Button>
          ) : undefined
        }
      />

      <QueryFeedback query={trashQuery} label="Trash" />
      {!isPending && !trashQuery.isError && items.length === 0 ? (
        <EmptyState
          icon={Trash2Icon}
          title="Trash is empty"
          description="Deleted resources, tasks and projects land here for 30 days before being purged."
        />
      ) : (
        <div className="space-y-6">
          {SECTIONS.map(({ key, label }) => {
            const section = items.filter((i) => i.entityType === key)
            if (!section.length) return null
            return (
              <section key={key}>
                <h2 className="mb-2 text-sm font-medium text-text-muted">
                  {label}{" "}
                  <span className="text-subtle">({section.length})</span>
                </h2>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {section.map((item) => (
                    <Row key={item.id} item={item} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmingEmpty}
        onOpenChange={setConfirmingEmpty}
        title="Empty Trash?"
        description={`Permanently deletes all ${items.length} item${items.length === 1 ? "" : "s"} in Trash, including any uploaded files. This can't be undone.`}
        confirmLabel="Empty Trash"
        onConfirm={() => emptyTrash.mutateAsync()}
      />
    </>
  )
}
