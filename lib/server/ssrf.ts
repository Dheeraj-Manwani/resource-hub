import "server-only"

import dns from "node:dns"
import net from "node:net"

import ipaddr from "ipaddr.js"
import { Agent, fetch as undiciFetch } from "undici"

export class SsrfError extends Error {}

const MAX_REDIRECTS = 3
const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024
const USER_AGENT =
  "ResourceHubBot/1.0 (+personal bookmark manager; fetches only on user action)"

/** Only globally routable unicast addresses are allowed. */
export function isPublicAddress(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false
  let addr = ipaddr.parse(ip)
  if (addr.kind() === "ipv6") {
    const v6 = addr as ipaddr.IPv6
    if (v6.isIPv4MappedAddress()) addr = v6.toIPv4Address()
  }
  return addr.range() === "unicast"
}

/** Validates scheme, port, credentials and literal-IP hosts. */
export function assertUrlAllowed(input: string | URL): URL {
  let url: URL
  try {
    url = new URL(input.toString())
  } catch {
    throw new SsrfError("Invalid URL")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("Only http(s) URLs can be fetched")
  }
  if (url.username || url.password) {
    throw new SsrfError("URLs with credentials are not allowed")
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new SsrfError("Only default ports are allowed")
  }
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new SsrfError("Host is not allowed")
  }
  // Literal IPs never go through DNS lookup, so check them here.
  if (net.isIP(host) && !isPublicAddress(host)) {
    throw new SsrfError("Address is not allowed")
  }
  return url
}

// Every connection (including redirects) resolves through this lookup, so a
// DNS answer pointing at a private range is rejected at connect time. This
// also closes the DNS-rebinding gap between validation and connection.
const guardedAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
        if (err) return callback(err, [] as never)
        const blocked = addresses.find((a) => !isPublicAddress(a.address))
        if (blocked || addresses.length === 0) {
          return callback(
            new SsrfError(`Blocked address for ${hostname}`),
            [] as never
          )
        }
        if ((options as { all?: boolean }).all) {
          callback(null, addresses)
        } else {
          callback(null, addresses[0]!.address, addresses[0]!.family)
        }
      })
    },
  },
  headersTimeout: DEFAULT_TIMEOUT_MS,
  bodyTimeout: DEFAULT_TIMEOUT_MS,
})

export type SafeFetchOptions = {
  timeoutMs?: number
  maxBytes?: number
  /** Allowed content types (prefix match), e.g. ["text/html", "image/"]. */
  accept?: string[]
  headers?: Record<string, string>
}

export type SafeFetchResult = {
  url: string
  status: number
  contentType: string
  body: Buffer
  text: () => string
  json: <T>() => T
}

async function readCapped(
  response: Response,
  maxBytes: number
): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") ?? "0")
  if (declared > maxBytes) throw new SsrfError("Response too large")
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new SsrfError("Response too large")
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

/**
 * fetch() for untrusted URLs: http(s) only, private/loopback/link-local
 * ranges blocked (checked on every connection), at most 3 redirects, a
 * timeout, a response-size cap and a content-type allowlist.
 */
export async function safeFetch(
  input: string | URL,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const signal = AbortSignal.timeout(timeoutMs)

  let url = assertUrlAllowed(input)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = (await undiciFetch(url, {
      dispatcher: guardedAgent,
      redirect: "manual",
      signal,
      headers: {
        "user-agent": USER_AGENT,
        accept:
          "text/html,application/xhtml+xml,application/json;q=0.9,image/*;q=0.8,*/*;q=0.5",
        "accept-language": "en",
        ...options.headers,
      },
    })) as unknown as Response

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      await response.body?.cancel()
      if (!location) throw new SsrfError("Redirect without location")
      if (hop === MAX_REDIRECTS) throw new SsrfError("Too many redirects")
      url = assertUrlAllowed(new URL(location, url))
      continue
    }

    const contentType = (
      response.headers.get("content-type") ?? ""
    ).toLowerCase()
    if (
      response.ok &&
      options.accept &&
      !options.accept.some((type) => contentType.startsWith(type))
    ) {
      await response.body?.cancel()
      throw new SsrfError(`Unexpected content type: ${contentType || "none"}`)
    }
    const body = response.ok
      ? await readCapped(response, maxBytes)
      : Buffer.alloc(0)
    if (!response.ok) await response.body?.cancel().catch(() => {})
    return {
      url: url.toString(),
      status: response.status,
      contentType,
      body,
      text: () => body.toString("utf8"),
      json: <T>() => JSON.parse(body.toString("utf8")) as T,
    }
  }
  throw new SsrfError("Too many redirects")
}
