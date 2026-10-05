import { afterEach, expect, it, vi } from "vitest"
import { uploadFile } from "@/hooks/use-uploads"
import { SyncController } from "@/lib/sync/controller"

afterEach(() => vi.unstubAllGlobals())
function transfers() {
  const sent: FakeXHR[] = []
  class FakeXHR {
    status = 200
    timeout = 0
    upload = { onprogress: null }
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    onabort: (() => void) | null = null
    ontimeout: (() => void) | null = null
    open() {}
    setRequestHeader() {}
    send() {
      sent.push(this)
    }
  }
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith("/uploads")
            ? {
                fileId: "f",
                uploadUrl: "https://storage.test/put",
                headers: {},
              }
            : { id: "resource" }
        )
      )
  )
  vi.stubGlobal("XMLHttpRequest", FakeXHR)
  vi.stubGlobal("fetch", fetch)
  return { sent, fetch }
}
it("limits independent file transfers to three and releases a timed-out slot", async () => {
  const { sent } = transfers(),
    sync = new SyncController()
  const jobs = Array.from({ length: 4 }, (_, i) =>
    uploadFile(new File(["data"], `${i}.txt`), { sync })
  )
  const finished = Promise.allSettled(jobs)
  await vi.waitFor(() => expect(sent).toHaveLength(3))
  expect(sent[0].timeout).toBe(180_000)
  sent[0].ontimeout?.()
  await vi.waitFor(() => expect(sent).toHaveLength(4))
  for (const xhr of sent.slice(1)) xhr.onload?.()
  const results = await finished
  expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(3)
  expect(results.filter((row) => row.status === "rejected")).toHaveLength(1)
})
it("cancels queued uploads and skips finalization after an account change", async () => {
  const { sent, fetch } = transfers(),
    sync = new SyncController()
  sync.setSession("one")
  const finished = Promise.allSettled(
    Array.from({ length: 4 }, (_, i) =>
      uploadFile(new File(["data"], `${i}.txt`), { sync })
    )
  )
  await vi.waitFor(() => expect(sent).toHaveLength(3))
  sync.setSession("two")
  for (const xhr of sent) xhr.onload?.()
  const results = await finished
  expect(results.every((row) => row.status === "rejected")).toBe(true)
  expect(sent).toHaveLength(3)
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(sync.store.getState().operations).toEqual({})
})
