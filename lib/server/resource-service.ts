import "server-only"

import { detectUrl, parseInput, type DetectedUrl } from "@/lib/resources/detect"
import type { ResourceType } from "@/lib/resources/types"
import { badRequest } from "@/lib/server/api"
import { insertResources, type NewResource } from "@/lib/server/dal/resources"
import { scheduleMetadata } from "@/lib/server/metadata-runner"

/** Plain text → minimal Tiptap document (one paragraph per line). */
export function textToDoc(text: string) {
  return {
    type: "doc",
    content: text
      .split("\n")
      .map((line) =>
        line.trim()
          ? { type: "paragraph", content: [{ type: "text", text: line }] }
          : { type: "paragraph" }
      ),
  }
}

export function noteResource(
  text: string,
  {
    title,
    tags,
    projectIds,
  }: { title?: string; tags?: string[]; projectIds?: string[] } = {}
): NewResource {
  return {
    type: "note",
    title: title ?? null,
    bodyJson: textToDoc(text),
    extractedText: text,
    metadata: {},
    metadataStatus: "ok",
    tags,
    projectIds,
  }
}

export function urlResource(
  detected: DetectedUrl,
  {
    type,
    title,
    notes,
    tags,
    projectIds,
  }: {
    type?: ResourceType
    title?: string
    notes?: string
    tags?: string[]
    projectIds?: string[]
  } = {}
): NewResource {
  const finalType =
    type && type !== "note" && type !== "file" && type !== "image"
      ? type
      : detected.type
  return {
    type: finalType,
    url: detected.url,
    urlNormalized: detected.urlNormalized,
    title: title ?? null,
    notes: notes ?? null,
    metadata: detected.metadata,
    metadataStatus: "pending",
    tags,
    projectIds,
  }
}

/** Creates one resource from a URL or free text and schedules its metadata. */
export async function createFromInput(
  userId: string,
  input: {
    url?: string
    text?: string
    type?: ResourceType
    title?: string
    notes?: string
    tags?: string[]
    projectIds?: string[]
  }
) {
  let item: NewResource
  if (input.url) {
    const detected = detectUrl(input.url)
    if (!detected)
      throw badRequest("That doesn't look like a valid http(s) URL")
    item = urlResource(detected, input)
  } else {
    const parsed = parseInput(input.text ?? "")
    if (parsed.kind === "empty") throw badRequest("Nothing to save")
    if (input.type === "note" || parsed.kind === "note") {
      item = noteResource(input.text!.trim(), {
        title: input.title,
        tags: input.tags,
        projectIds: input.projectIds,
      })
    } else {
      item = urlResource(parsed.items[0]!, {
        ...input,
        title: input.title ?? parsed.titleHint,
      })
    }
  }
  const [created] = await insertResources(userId, [item])
  if (item.metadataStatus === "pending") scheduleMetadata([created!.id])
  return created!
}

export async function createManyFromUrls(
  userId: string,
  urls: string[],
  tags?: string[],
  projectIds?: string[]
) {
  const items: NewResource[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  for (const raw of urls) {
    const detected = detectUrl(raw)
    if (!detected) {
      invalid.push(raw)
      continue
    }
    if (seen.has(detected.urlNormalized)) continue
    seen.add(detected.urlNormalized)
    items.push(urlResource(detected, { tags, projectIds }))
  }
  const created = await insertResources(userId, items)
  scheduleMetadata(created.map((r) => r.id))
  return { created, invalid }
}
