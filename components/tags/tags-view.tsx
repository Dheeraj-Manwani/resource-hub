"use client"
import { QueryFeedback } from "@/components/query-feedback"

import {
  PlusIcon,
  TagIcon,
  Trash2Icon,
  PencilIcon,
  PaletteIcon,
  CheckIcon,
} from "lucide-react"
import { useState } from "react"

import { AddTagDialog } from "./add-tag-dialog"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  useDeleteTag,
  useMergeTags,
  useRenameTag,
  useSetTagColor,
  useTagsWithCounts,
} from "@/hooks/queries/tags"
import { PROJECT_COLORS } from "@/lib/projects/types"
import type { TagWithCounts } from "@/lib/server/dal/tags"
import { cn } from "@/lib/utils"
import { ItemMenu } from "@/components/ui/item-menu"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"

const COLOR_NAMES: Record<(typeof PROJECT_COLORS)[number], string> = {
  "#FF6A00": "Orange",
  "#F59E0B": "Amber",
  "#EF4444": "Red",
  "#EC4899": "Pink",
  "#A855F7": "Purple",
  "#6366F1": "Indigo",
  "#0EA5E9": "Blue",
  "#14B8A6": "Teal",
  "#84CC16": "Green",
  "#78716C": "Gray",
}

function ColorSwatch({ tag }: { tag: TagWithCounts }) {
  const setColor = useSetTagColor()
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Change color"
            disabled={setColor.isPending}
            className="size-5 shrink-0 rounded-full ring-1 ring-black/20"
            style={{
              backgroundColor: tag.color ?? "var(--color-border-strong)",
            }}
          />
        }
      />
      <PopoverContent className="w-auto">
        <div className="flex items-center gap-1 p-0.5">
          {PROJECT_COLORS.map((c) => (
            <Button
              key={c}
              variant="ghost"
              size="icon-xs"
              loading={setColor.isPending && setColor.variables?.color === c}
              aria-label={`Color ${c}`}
              disabled={setColor.isPending}
              onClick={() => setColor.mutate({ id: tag.id, color: c })}
              style={{ backgroundColor: c }}
              className={cn(
                "size-5 rounded-full ring-1 ring-black/20 transition-transform hover:scale-110",
                tag.color === c && "ring-2 ring-white"
              )}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TagNameField({
  tag,
  editing,
  setEditing,
}: {
  tag: TagWithCounts
  editing: boolean
  setEditing: (editing: boolean) => void
}) {
  const rename = useRenameTag()
  const [value, setValue] = useState(tag.name)

  function commit() {
    setEditing(false)
    const trimmed = value.trim()
    if (trimmed && trimmed !== tag.name)
      rename.mutate({ id: tag.id, name: trimmed })
    else setValue(tag.name)
  }

  if (!editing) {
    return (
      <button
        type="button"
        disabled={rename.isPending}
        onClick={() => setEditing(true)}
        className="truncate text-left text-sm font-medium hover:underline"
      >
        #{tag.name}
      </button>
    )
  }
  return (
    <Input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit()
        if (e.key === "Escape") {
          setValue(tag.name)
          setEditing(false)
        }
      }}
      className="h-7 max-w-48"
    />
  )
}

function TagRow({
  tag,
  selected,
  onToggle,
  onDelete,
}: {
  tag: TagWithCounts
  selected: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const color = useSetTagColor()
  return (
    <ItemMenu
      label={`#${tag.name} options`}
      trigger={<li className="flex items-center gap-3 px-3 py-2.5" />}
      actions={
        <>
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <PencilIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <PaletteIcon />
              Change color
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {PROJECT_COLORS.map((value) => (
                <DropdownMenuItem
                  key={value}
                  disabled={color.isPending}
                  onClick={() => color.mutate({ id: tag.id, color: value })}
                >
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: value }}
                  />
                  {COLOR_NAMES[value]}
                  {tag.color === value && <CheckIcon className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={onToggle}>
            <CheckIcon />
            {selected ? "Deselect" : "Select"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2Icon />
            Delete tag
          </DropdownMenuItem>
        </>
      }
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        aria-label={`Select #${tag.name}`}
      />
      <ColorSwatch tag={tag} />
      <div className="min-w-0 flex-1">
        <TagNameField
          key={tag.name}
          tag={tag}
          editing={editing}
          setEditing={setEditing}
        />
      </div>
      <span className="shrink-0 text-xs text-subtle">
        {tag.resourceCount} resource{tag.resourceCount === 1 ? "" : "s"} ·{" "}
        {tag.taskCount} task{tag.taskCount === 1 ? "" : "s"}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete #${tag.name}`}
        onClick={onDelete}
      >
        <Trash2Icon />
      </Button>
    </ItemMenu>
  )
}

export function TagsView() {
  const [adding, setAdding] = useState(false)
  const tagsQuery = useTagsWithCounts()
  const { data: tags = [], isPending } = tagsQuery
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<TagWithCounts | null>(null)
  const deleteTag = useDeleteTag()
  const mergeTags = useMergeTags()

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedTags = tags.filter((t) => selected.has(t.id))

  return (
    <>
      <PageHeader
        title="Tags"
        description="Rename, recolor, merge or delete tags used across resources and tasks."
        actions={
          <>
            <Button size="sm" onClick={() => setAdding(true)}>
              <PlusIcon />
              New tag
            </Button>
            {selectedTags.length >= 2 ? (
              <Popover>
                <PopoverTrigger render={<Button variant="outline" size="sm" />}>
                  Merge {selectedTags.length} tags…
                </PopoverTrigger>
                <PopoverContent>
                  <p className="mb-2 text-xs text-text-muted">
                    Merge into which tag? The others are deleted; every resource
                    and task keeps the tag.
                  </p>
                  <ul className="space-y-0.5">
                    {selectedTags.map((t) => (
                      <li key={t.id}>
                        <Button
                          variant="ghost"
                          loading={
                            mergeTags.isPending &&
                            mergeTags.variables?.targetId === t.id
                          }
                          disabled={mergeTags.isPending}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/[0.06]"
                          onClick={() => {
                            mergeTags.mutate(
                              {
                                sourceIds: selectedTags
                                  .filter((s) => s.id !== t.id)
                                  .map((s) => s.id),
                                targetId: t.id,
                              },
                              { onSuccess: () => setSelected(new Set()) }
                            )
                          }}
                        >
                          <TagIcon className="size-3.5 text-subtle" />#{t.name}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            ) : null}
          </>
        }
      />
      <AddTagDialog open={adding} onOpenChange={setAdding} />

      <QueryFeedback query={tagsQuery} label="tags" />
      {!isPending && !tagsQuery.isError && tags.length === 0 ? (
        <EmptyState
          icon={TagIcon}
          title="No tags yet"
          description="Tags you add to resources and tasks will show up here, with how often each is used."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {tags.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              selected={selected.has(tag.id)}
              onToggle={() => toggle(tag.id)}
              onDelete={() => setDeleting(tag)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete #${deleting?.name}?`}
        description="The tag is removed from every resource and task it's on. This can't be undone."
        confirmLabel="Delete"
        onConfirm={() =>
          deleting ? deleteTag.mutateAsync(deleting.id) : undefined
        }
      />
    </>
  )
}
