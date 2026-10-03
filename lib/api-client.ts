/** Thin fetch wrapper for /api/v1 used by TanStack Query hooks. */
export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message)
  }
}

export async function api<T>(
  path: string,
  init?: Omit<RequestInit, "body"> & { body?: unknown }
): Promise<T> {
  const { body, headers, ...rest } = init ?? {}
  const response = await fetch(path, {
    ...rest,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (response.status === 401 && typeof window !== "undefined") {
    // Session expired: reloading lets the server redirect to the landing page.
    window.location.reload()
  }
  const data =
    response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const error = (
      data as {
        error?: { message?: string; code?: string; details?: unknown }
      } | null
    )?.error
    throw new ApiClientError(
      response.status,
      error?.message ?? `Request failed (${response.status})`,
      error?.code,
      error?.details
    )
  }
  return data as T
}

export function toQueryString(
  params: Record<string, string | number | boolean | undefined | null>
) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      value === false
    )
      continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}
