"use client"

import { useContext } from "react"
import { ItemMenu } from "@/components/ui/item-menu"
import { displayTitle } from "@/lib/resources/dto"
import { MasonryRetention } from "./masonry-retention"

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
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { useDeleteResource, useUpdateResource } from "@/hooks/queries/resources"
import type { ResourceDto } from "@/lib/resources/dto"

/**
 * Right-click menu shared by every surface that renders a resource (grid
 * cards, list rows, overview). The original element and its ref are retained
 * so drag-and-drop and virtualized layouts need no extra wrapper DOM node.
 */
export function ResourceContextMenu({
  resource,
  onPreview,
  onEdit,
  trigger,
  children,
  buttonClassName,
}: {
  resource: ResourceDto
  onPreview: (id: string) => void
  onEdit: (id: string) => void
  trigger: React.ReactElement<React.HTMLAttributes<HTMLElement>>
  children: React.ReactNode
  buttonClassName?: string
}) {
  const retain = useContext(MasonryRetention)
  const update = useUpdateResource()
  const remove = useDeleteResource()

  return (
    <ItemMenu
      trigger={trigger}
      label={`${displayTitle(resource)} options`}
      buttonClassName={buttonClassName}
      onOpenChange={(open) => retain?.("menu", open)}
      actions={
        <>
          <DropdownMenuItem onClick={() => onPreview(resource.id)}>
            <EyeIcon />
            Preview
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(resource.id)}>
            <Edit />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              update.mutate({
                id: resource.id,
                patch: { isFavorite: !resource.isFavorite },
              })
            }
          >
            <StarIcon
              className={
                resource.isFavorite ? "fill-brand text-brand" : undefined
              }
            />
            {resource.isFavorite ? "Remove from favorites" : "Add to favorites"}
          </DropdownMenuItem>
          <DropdownMenuItem
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
          </DropdownMenuItem>
          {resource.url ? (
            <DropdownMenuItem
              render={
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <ExternalLinkIcon />
              Open original
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => remove.mutate(resource.id)}
          >
            <Trash2Icon />
            Move to trash
          </DropdownMenuItem>
        </>
      }
    >
      {children}
    </ItemMenu>
  )
}
