import { z } from "zod"

export const MAX_DRAWING_BYTES = 3_000_000

const point = z.tuple([z.number(), z.number()])
const elementSchema = z
  .object({
    id: z.string().min(1).max(200),
    type: z.enum([
      "rectangle",
      "diamond",
      "ellipse",
      "line",
      "arrow",
      "freedraw",
      "text",
      "image",
      "frame",
      "magicframe",
      "embeddable",
      "iframe",
    ]),
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    isDeleted: z.boolean().optional(),
    text: z.string().optional(),
    points: z.array(point).max(100_000).optional(),
    fileId: z.string().nullable().optional(),
  })
  .passthrough()
  .superRefine((element, ctx) => {
    if (
      ["line", "arrow", "freedraw"].includes(element.type) &&
      !element.points?.length
    )
      ctx.addIssue({ code: "custom", message: "Drawing strokes need points." })
  })

export const drawingSchema = z
  .object({
    type: z.literal("excalidraw"),
    version: z.literal(2),
    source: z.string().optional(),
    elements: z.array(elementSchema).max(20_000),
    // Store document settings only; selections, collaborators and other UI state
    // contain transient values that must not be restored as plain JSON objects.
    appState: z
      .object({
        viewBackgroundColor: z.string().max(100).optional(),
        gridSize: z.number().positive().nullable().optional(),
        gridStep: z.number().positive().optional(),
        gridModeEnabled: z.boolean().optional(),
      })
      .default({}),
    files: z
      .record(
        z.string(),
        z.object({
          id: z.string(),
          mimeType: z.enum([
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
            "image/svg+xml",
          ]),
          dataURL: z
            .string()
            .regex(/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/),
          created: z.number(),
          lastRetrieved: z.number().optional(),
        })
      )
      .default({}),
  })
  .superRefine((value, ctx) => {
    if (
      new TextEncoder().encode(JSON.stringify(value)).byteLength >
      MAX_DRAWING_BYTES
    )
      ctx.addIssue({
        code: "custom",
        message: "This drawing is too large (3 MB limit).",
      })
    for (const [id, file] of Object.entries(value.files)) {
      if (id !== file.id)
        ctx.addIssue({
          code: "custom",
          message: "Invalid drawing image reference.",
        })
    }
    if (
      new Set(value.elements.map((element) => element.id)).size !==
      value.elements.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Drawing element IDs must be unique.",
      })
  })

export type DrawingData = z.infer<typeof drawingSchema>

export function createDrawing(): DrawingData {
  return {
    type: "excalidraw",
    version: 2,
    source: "Resource Hub",
    elements: [],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  }
}

/** Search labels and give freehand-only drawings a useful card preview. */
export function drawingText(data: DrawingData): string {
  const elements = data.elements.filter((element) => !element.isDeleted)
  const text = elements
    .map((element) => element.text ?? "")
    .filter(Boolean)
    .join(" · ")
  return (
    text ||
    (elements.length
      ? `${elements.length} drawing element${elements.length === 1 ? "" : "s"}`
      : "")
  ).slice(0, 50_000)
}
