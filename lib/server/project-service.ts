import "server-only"

import { db } from "@/lib/db"
import { badRequest, notFound } from "@/lib/server/api"
import { linkResources, moveResources, unlinkResources } from "@/lib/server/dal/project-links"
import {
  filterOwnedResourceIds,
  getResourcesByIds,
  setFavoriteMany,
  softDeleteResources,
} from "@/lib/server/dal/resources"
import {
  addResourceTags,
  ensureTags,
  removeResourceTagsByName,
} from "@/lib/server/dal/tags"
import type { BulkActionInput } from "@/lib/validation/projects"

/** Runs one bulk action, verifying resource ownership up front, and returns
 * the affected resources' fresh state for the client to merge into its cache. */
export async function runBulkAction(userId: string, input: BulkActionInput) {
  const owned = await filterOwnedResourceIds(userId, input.resourceIds)
  if (owned.length !== input.resourceIds.length)
    throw badRequest("Some of those resources weren't found")

  switch (input.action) {
    case "link": {
      if (!(await linkResources(userId, input.projectId, owned)))
        throw notFound("Project")
      break
    }
    case "unlink": {
      if (!(await unlinkResources(userId, input.projectId, owned)))
        throw notFound("Project")
      break
    }
    case "move": {
      if (!(await moveResources(userId, owned, input.from, input.to)))
        throw badRequest("Couldn't move those resources")
      break
    }
    case "tag": {
      await db.transaction(async (tx) => {
        const tagIds = await ensureTags(tx, userId, input.tags)
        await addResourceTags(tx, owned, tagIds)
      })
      break
    }
    case "untag": {
      await db.transaction(async (tx) => {
        await removeResourceTagsByName(tx, userId, owned, input.tags)
      })
      break
    }
    case "favorite": {
      await setFavoriteMany(userId, owned, input.value)
      break
    }
    case "delete": {
      await softDeleteResources(userId, owned)
      return [] // deleted resources no longer resolve; the client removes them locally
    }
  }
  return getResourcesByIds(userId, owned)
}
