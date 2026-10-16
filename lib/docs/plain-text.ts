import { z } from "zod"
import type { TextNode } from "./text-document"

export const MAX_PLAIN_TEXT_BYTES = 3_000_000

/** Stored with bodyText, and copied unchanged into document version snapshots. */
export const plainTextFormatSchema = z
  .object({
    type: z.literal("plainText"),
    version: z.literal(1),
  })
  .strict()

export function plainTextFormat() {
  return { type: "plainText", version: 1 } as const
}

export function isPlainTextDocument(value: unknown): boolean {
  return plainTextFormatSchema.safeParse(value).success
}

export function isPlainTextFormatCandidate(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    "type" in value &&
    value.type === "plainText"
  )
}

export const plainTextBodySchema = z
  .string()
  .refine(
    (value) => !value.includes("\0"),
    "Text docs cannot contain null characters."
  )
  .refine(
    (value) =>
      new TextEncoder().encode(value).byteLength <= MAX_PLAIN_TEXT_BYTES,
    "Text docs support up to 3 MB of text."
  )

export const plainTextRecoverySchema = z.object({
  version: z.literal(1),
  id: z.uuid().nullable(),
  clientId: z.uuid().optional(),
  revision: z.number().int().nonnegative(),
  projectId: z.uuid().nullable(),
  title: z.string().max(200),
  text: plainTextBodySchema,
})
export type PlainTextRecovery = z.infer<typeof plainTextRecoverySchema>

/** Fallback for old text docs whose searchable bodyText was never populated. */
export function richDocumentText(value: unknown): string {
  if (!value || typeof value !== "object") return ""
  function read(node: TextNode): string {
    if (node.type === "text") return node.text ?? ""
    if (node.type === "hardBreak") return "\n"
    if (node.type === "image") {
      const caption = String(node.attrs?.caption ?? node.attrs?.alt ?? "")
      return caption ? caption + "\n" : ""
    }
    const text = (node.content ?? []).map(read).join("")
    return ["paragraph", "heading", "codeBlock"].includes(node.type)
      ? text + "\n"
      : text
  }
  return read(value as TextNode).replace(/\n$/, "")
}
