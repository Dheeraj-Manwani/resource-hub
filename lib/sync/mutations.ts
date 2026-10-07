import type { MutationMeta } from "@tanstack/react-query"

type Entity =
  | "task"
  | "resource"
  | "project"
  | "quick-note"
  | "tag"
  | "reminder"
  | "settings"
  | "trash"
  | "token"
export type SyncMutationMeta = {
  label: string
  entity: Entity
  safeRetry?: boolean
}
const operations = {
  "task.create": { label: "Creating task", entity: "task" },
  "task.update": { label: "Saving task", entity: "task", safeRetry: true },
  "task.move": { label: "Moving task", entity: "task" },
  "task.delete": { label: "Deleting task", entity: "task" },
  "task.duplicate": { label: "Duplicating task", entity: "task" },
  "task.archive": { label: "Archiving task", entity: "task" },
  "task.link": { label: "Linking resources", entity: "task" },
  "task.unlink": { label: "Unlinking resource", entity: "task" },
  "task.checklist-add": { label: "Adding checklist item", entity: "task" },
  "task.checklist-update": {
    label: "Saving checklist item",
    entity: "task",
    safeRetry: true,
  },
  "task.checklist-delete": { label: "Deleting checklist item", entity: "task" },
  "task.checklist-move": { label: "Reordering checklist", entity: "task" },
  "task.bulk": { label: "Updating tasks", entity: "task" },
  "calendar.edit": { label: "Saving calendar change", entity: "task" },
  "resource.create": { label: "Saving resource", entity: "resource" },
  "resource.bulk-create": { label: "Saving links", entity: "resource" },
  "resource.update": {
    label: "Saving resource",
    entity: "resource",
    safeRetry: true,
  },
  "resource.delete": { label: "Moving resource to Trash", entity: "resource" },
  "resource.refresh": {
    label: "Requesting metadata refresh",
    entity: "resource",
  },
  "resource.demo": { label: "Loading demo resources", entity: "resource" },
  "project.create": { label: "Creating project", entity: "project" },
  "project.update": {
    label: "Saving project",
    entity: "project",
    safeRetry: true,
  },
  "project.move": { label: "Moving project", entity: "project" },
  "project.checklist": {
    label: "Saving resource checklist",
    entity: "project",
    safeRetry: true,
  },
  "project.delete": { label: "Deleting project", entity: "project" },
  "project.link": { label: "Adding resources to project", entity: "project" },
  "project.unlink": {
    label: "Removing resources from project",
    entity: "project",
  },
  "project.move-resources": { label: "Moving resources", entity: "resource" },
  "project.bulk-resources": { label: "Updating resources", entity: "resource" },
  "quick-note.create": { label: "Creating doc", entity: "quick-note" },
  "quick-note.update": {
    label: "Saving doc",
    entity: "quick-note",
    safeRetry: true,
  },
  "quick-note.delete": { label: "Moving doc to Trash", entity: "quick-note" },
  "reminder.add": { label: "Adding reminder", entity: "task" },
  "reminder.delete": { label: "Removing reminder", entity: "task" },
  "reminder.dismiss": { label: "Dismissing reminder", entity: "reminder" },
  "settings.feed": { label: "Generating calendar link", entity: "settings" },
  "settings.update": {
    label: "Saving settings",
    entity: "settings",
    safeRetry: true,
  },
  "tag.create": { label: "Creating tag", entity: "tag" },
  "tag.rename": { label: "Renaming tag", entity: "tag" },
  "tag.color": { label: "Saving tag color", entity: "tag", safeRetry: true },
  "tag.merge": { label: "Merging tags", entity: "tag" },
  "tag.delete": { label: "Deleting tag", entity: "tag" },
  "trash.restore": { label: "Restoring item", entity: "trash" },
  "trash.delete": { label: "Permanently deleting item", entity: "trash" },
  "trash.empty": { label: "Emptying Trash", entity: "trash" },
  "token.create": { label: "Creating token", entity: "token" },
  "token.revoke": { label: "Revoking token", entity: "token" },
} satisfies Record<string, SyncMutationMeta>

export function syncMutation(key: keyof typeof operations) {
  return { mutationKey: key.split("."), meta: { sync: operations[key] } }
}

export function getSyncMeta(
  meta: MutationMeta | undefined
): SyncMutationMeta | undefined {
  return meta?.sync as SyncMutationMeta | undefined
}

export function describeMutation(meta: SyncMutationMeta, variables: unknown) {
  const vars = (
    variables && typeof variables === "object" ? variables : {}
  ) as Record<string, unknown>
  const id =
    typeof variables === "string"
      ? variables
      : (vars.id ?? vars.taskId ?? vars.projectId ?? vars.reminderId)
  const entity =
    meta.entity === "trash" && typeof vars.entityType === "string"
      ? vars.entityType
      : meta.entity
  const ownIds =
    entity === "task"
      ? vars.taskIds
      : entity === "resource"
        ? vars.resourceIds
        : undefined
  const entityKeys = id
    ? [`${entity}:${id}`]
    : Array.isArray(ownIds) && ownIds.length
      ? []
      : [`${entity}:all`]
  for (const field of ["resourceIds", "taskIds", "sourceIds"]) {
    if (Array.isArray(vars[field])) {
      const type =
        field === "resourceIds"
          ? "resource"
          : field === "taskIds"
            ? "task"
            : "tag"
      entityKeys.push(...vars[field].map((value) => `${type}:${value}`))
    }
  }
  const href =
    entity === "resource"
      ? id
        ? `/resources?r=${id}`
        : "/resources"
      : entity === "task"
        ? id
          ? `/tasks?t=${id}`
          : "/tasks"
        : entity === "project"
          ? id
            ? `/projects/${id}`
            : "/overview"
          : entity === "quick-note"
            ? "/docs"
            : entity === "tag"
              ? "/tags"
              : entity === "reminder"
                ? "/calendar"
                : entity === "trash"
                  ? "/trash"
                  : "/settings"
  // Recurrence changes can materialize occurrences; don't automatically replay them.
  const patch = vars.patch as Record<string, unknown> | undefined
  const safeRetry =
    !!meta.safeRetry &&
    patch?.rrule === undefined &&
    patch?.bodyJson === undefined &&
    patch?.descriptionJson === undefined &&
    vars.bodyJson === undefined &&
    vars.bodyText === undefined
  return {
    entityKeys,
    href: meta.entity === "trash" ? "/trash" : href,
    safeRetry,
    draftKey:
      id &&
      (patch?.bodyJson !== undefined || patch?.descriptionJson !== undefined)
        ? `${entity}:${id}`
        : undefined,
  }
}
