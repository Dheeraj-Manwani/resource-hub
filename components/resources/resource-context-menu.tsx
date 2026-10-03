"use client"

import {
  CheckCircle2Icon,
  CircleIcon,
  Edit,
  ExternalLinkIcon,
  EyeIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useDeleteResource, useUpdateResource } from "@/hooks/queries/resources"
import type { ResourceDto } from "@/lib/resources/dto"

/**
 * Right-click menu shared by every surface that renders a resource (grid
 * cards, list rows, focus view). `trigger` becomes the element the menu is
 * anchored to via Base UI's `render` prop, so it adds no wrapper DOM node.
 */
export function ResourceContextMenu({
  resource,
  onPreview,
  onEdit,
  trigger,
  children,
}: {
  resource: ResourceDto
  onPreview: (id: string) => void
  onEdit: (id: string) => void
  trigger: React.ReactElement
  children: React.ReactNode
}) {
  const update = useUpdateResource()
  const remove = useDeleteResource()

  return (
    <ContextMenu>
      <ContextMenuTrigger render={trigger}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onPreview(resource.id)}>
          <EyeIcon />
          Preview
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onEdit(resource.id)}>
          <Edit />
          Edit
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() =>
            update.mutate({
              id: resource.id,
              patch: { isFavorite: !resource.isFavorite },
            })
          }
        >
          <StarIcon className={resource.isFavorite ? "fill-brand text-brand" : undefined} />
          {resource.isFavorite ? "Remove from favorites" : "Add to favorites"}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() =>
            update.mutate({
              id: resource.id,
              patch: { isReviewed: !resource.isReviewed },
            })
          }
        >
          {resource.isReviewed ? (
            <CircleIcon />
          ) : (
            <CheckCircle2Icon className="text-emerald-400" />
          )}
          {resource.isReviewed ? "Mark as not reviewed" : "Mark as reviewed"}
        </ContextMenuItem>
        {resource.url ? (
          <ContextMenuItem
            render={
              <a href={resource.url} target="_blank" rel="noopener noreferrer" />
            }
          >
            <ExternalLinkIcon />
            Open original
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => remove.mutate(resource.id)}>
          <Trash2Icon />
          Move to trash
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
