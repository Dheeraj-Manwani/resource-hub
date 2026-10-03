import { describe, expect, it } from "vitest"

import {
  assertUrlAllowed,
  isPublicAddress,
  safeFetch,
  SsrfError,
} from "@/lib/server/ssrf"

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "172.16.3.4",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "255.255.255.255",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
  ])("blocks %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false)
  })

  it.each(["8.8.8.8", "1.1.1.1", "142.250.72.14", "2606:4700:4700::1111"])(
    "allows %s",
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true)
    }
  )

  it("rejects garbage", () => {
    expect(isPublicAddress("not-an-ip")).toBe(false)
  })
})

describe("assertUrlAllowed", () => {
  it("allows public http(s) URLs", () => {
    expect(assertUrlAllowed("https://example.com/x").hostname).toBe(
      "example.com"
    )
  })
  it.each([
    "file:///etc/passwd",
    "gopher://example.com",
    "http://localhost:3000",
    "http://127.0.0.1/admin",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "http://10.1.2.3",
    "https://user:pass@example.com",
    "https://example.com:8080/",
    "http://printer.local/",
    "not a url",
  ])("rejects %s", (url) => {
    expect(() => assertUrlAllowed(url)).toThrow(SsrfError)
  })
})

describe("safeFetch", () => {
  it("refuses private targets before any network access", async () => {
    await expect(safeFetch("http://127.0.0.1:80/")).rejects.toBeInstanceOf(
      SsrfError
    )
    await expect(safeFetch("http://192.168.0.1/")).rejects.toBeInstanceOf(
      SsrfError
    )
  })
})
