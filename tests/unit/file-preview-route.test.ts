import { beforeEach, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { MAX_PREVIEW_BYTES } from "@/lib/resources/preview"

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  file: vi.fn(),
  bytes: vi.fn(),
  parse: vi.fn(),
}))
vi.mock("@/lib/server/dal/session", () => ({ requireApiUser: mocks.user }))
vi.mock("@/lib/server/dal/files", () => ({ getUserFile: mocks.file }))
vi.mock("@/lib/server/r2", () => ({ getObjectBytes: mocks.bytes }))
vi.mock("@/lib/server/file-preview", () => ({ parseFilePreview: mocks.parse }))
import { GET } from "@/app/api/files/[fileId]/preview/route"

const id = "019a7799-3210-7000-8000-000000000001"
const invoke = () =>
  GET(new NextRequest(`http://localhost/api/files/${id}/preview`), {
    params: Promise.resolve({ fileId: id }),
  })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.user.mockResolvedValue({ id: "owner" })
  mocks.file.mockResolvedValue({
    id,
    name: "file.txt",
    mime: "text/plain",
    size: 4,
    status: "ready",
    r2Key: "owner/file",
  })
  mocks.bytes.mockResolvedValue(Buffer.from("text"))
  mocks.parse.mockResolvedValue({
    kind: "text",
    text: "text",
    truncated: false,
  })
})

it("checks ownership before reading storage and does not cache private content", async () => {
  const response = await invoke()
  expect(mocks.file).toHaveBeenCalledWith("owner", id)
  expect(mocks.bytes).toHaveBeenCalledWith("owner/file")
  expect(response.status).toBe(200)
  expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  expect(await response.json()).toEqual({
    kind: "text",
    text: "text",
    truncated: false,
  })
})

it("does not read another user's file or an unfinished upload", async () => {
  for (const file of [null, { status: "pending" }]) {
    mocks.file.mockResolvedValueOnce(file)
    expect((await invoke()).status).toBe(404)
  }
  expect(mocks.bytes).not.toHaveBeenCalled()
})

it("rejects oversized files before downloading the object", async () => {
  mocks.file.mockResolvedValue({ status: "ready", size: MAX_PREVIEW_BYTES + 1 })
  expect((await invoke()).status).toBe(400)
  expect(mocks.bytes).not.toHaveBeenCalled()
})

it("provides a useful fallback without exposing parser internals", async () => {
  mocks.parse.mockRejectedValue(new Error("internal zip stack/path"))
  const response = await invoke()
  expect(response.status).toBe(400)
  const data = await response.json()
  expect(data.error.message).toContain("damaged or password-protected")
  expect(data.error.message).not.toContain("internal")
})
