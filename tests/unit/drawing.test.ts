import { describe, expect, it } from "vitest"
import {
  createDrawing,
  drawingSchema,
  drawingText,
  MAX_DRAWING_BYTES,
} from "@/lib/docs/drawing"

const stroke = {
  id: "stroke",
  type: "freedraw" as const,
  x: 10,
  y: 20,
  width: 100,
  height: 40,
  points: [
    [0, 0],
    [100, 40],
  ],
}

describe("drawing documents", () => {
  it("roundtrips strokes, text, images and document settings while removing transient UI state", () => {
    const scene = drawingSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...createDrawing(),
          elements: [
            stroke,
            {
              id: "label",
              type: "text",
              x: 10,
              y: 70,
              width: 90,
              height: 20,
              text: "Plan",
              fontFamily: 5,
            },
          ],
          appState: {
            viewBackgroundColor: "#fff",
            selectedElementIds: { label: true },
            collaborators: {},
          },
          files: {
            image: {
              id: "image",
              mimeType: "image/png",
              dataURL: "data:image/png;base64,aGVsbG8=",
              created: 1,
            },
          },
        })
      )
    )
    expect(scene.elements[0].points).toEqual(stroke.points)
    expect(scene.elements[1].fontFamily).toBe(5)
    expect(scene.files.image.dataURL).toContain("base64")
    expect(scene.appState).toEqual({ viewBackgroundColor: "#fff" })
    expect(drawingText(scene)).toBe("Plan")
  })
  it("rejects malformed scenes, duplicate IDs, invalid strokes and oversized payloads", () => {
    for (const scene of [
      {},
      { ...createDrawing(), elements: [{ ...stroke, points: undefined }] },
      { ...createDrawing(), elements: [stroke, stroke] },
      { ...createDrawing(), elements: [{ ...stroke, x: Infinity }] },
      { ...createDrawing(), source: "x".repeat(MAX_DRAWING_BYTES) },
    ])
      expect(drawingSchema.safeParse(scene).success).toBe(false)
  })
  it("previews freehand scenes and omits deleted text", () => {
    expect(drawingText(createDrawing())).toBe("")
    expect(
      drawingText(
        drawingSchema.parse({
          ...createDrawing(),
          elements: [
            stroke,
            { ...stroke, id: "deleted", isDeleted: true, text: "Gone" },
          ],
        })
      )
    ).toBe("1 drawing element")
  })
})
