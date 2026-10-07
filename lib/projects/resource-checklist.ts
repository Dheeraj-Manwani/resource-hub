import { z } from "zod"

export type ResourceChecklistDto = {
  enabled: boolean
  resourceIds: string[]
  checkedResourceIds: string[]
}

export const resourceChecklistActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mode"), enabled: z.boolean() }).strict(),
  z
    .object({
      action: z.literal("check"),
      resourceId: z.uuid(),
      checked: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal("reset") }).strict(),
])
export type ResourceChecklistAction = z.infer<
  typeof resourceChecklistActionSchema
>
