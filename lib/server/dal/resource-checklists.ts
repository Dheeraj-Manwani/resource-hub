import "server-only"

import { and, eq, inArray, isNull } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  projects,
  projectResources,
  resources,
  resourceChecklists,
  resourceChecklistChecks,
} from "@/lib/db/schema"
import type {
  ResourceChecklistAction,
  ResourceChecklistDto,
} from "@/lib/projects/resource-checklist"
import { getDescendantIds } from "./projects"

export async function getResourceChecklist(
  userId: string,
  projectId: string,
  includeDescendants: boolean
): Promise<ResourceChecklistDto | null> {
  const ids = await getDescendantIds(userId, projectId)
  if (!ids) return null
  const [mode, eligible, checks] = await Promise.all([
    db
      .select()
      .from(resourceChecklists)
      .where(eq(resourceChecklists.projectId, projectId)),
    db
      .selectDistinct({ id: resources.id })
      .from(projectResources)
      .innerJoin(resources, eq(resources.id, projectResources.resourceId))
      .where(
        and(
          inArray(
            projectResources.projectId,
            includeDescendants ? ids : [projectId]
          ),
          eq(resources.userId, userId),
          isNull(resources.deletedAt)
        )
      ),
    db
      .select()
      .from(resourceChecklistChecks)
      .where(eq(resourceChecklistChecks.projectId, projectId)),
  ])
  const resourceIds = eligible.map((r) => r.id)
  const eligibleIds = new Set(resourceIds)
  return {
    enabled: mode[0]?.enabled ?? false,
    resourceIds,
    checkedResourceIds: checks
      .filter((r) => eligibleIds.has(r.resourceId))
      .map((r) => r.resourceId),
  }
}

export async function updateResourceChecklist(
  userId: string,
  projectId: string,
  action: ResourceChecklistAction
): Promise<boolean> {
  const ids = await getDescendantIds(userId, projectId)
  if (!ids) return false
  return db.transaction(async (tx) => {
    // Serialize mode, check, and reset operations for this project's checklist.
    const [owned] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.userId, userId),
          isNull(projects.deletedAt)
        )
      )
      .for("update")
    if (!owned) return false
    await tx
      .insert(resourceChecklists)
      .values({ projectId })
      .onConflictDoNothing()
    if (action.action === "mode") {
      await tx
        .update(resourceChecklists)
        .set({ enabled: action.enabled })
        .where(eq(resourceChecklists.projectId, projectId))
    } else if (action.action === "reset") {
      await tx
        .delete(resourceChecklistChecks)
        .where(eq(resourceChecklistChecks.projectId, projectId))
    } else {
      const [linked] = await tx
        .select({ id: resources.id })
        .from(projectResources)
        .innerJoin(resources, eq(resources.id, projectResources.resourceId))
        .where(
          and(
            inArray(projectResources.projectId, ids),
            eq(resources.id, action.resourceId),
            eq(resources.userId, userId),
            isNull(resources.deletedAt)
          )
        )
        .limit(1)
      if (!linked) return false
      if (action.checked) {
        await tx
          .insert(resourceChecklistChecks)
          .values({ projectId, resourceId: action.resourceId })
          .onConflictDoNothing()
      } else {
        await tx
          .delete(resourceChecklistChecks)
          .where(
            and(
              eq(resourceChecklistChecks.projectId, projectId),
              eq(resourceChecklistChecks.resourceId, action.resourceId)
            )
          )
      }
    }
    return true
  })
}
