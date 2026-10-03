import "server-only"

import { NextResponse, type NextRequest } from "next/server"
import { z, ZodError, type ZodType } from "zod"

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = "error",
    public details?: unknown
  ) {
    super(message)
  }
}

export const unauthorized = () =>
  new ApiError(401, "Not signed in", "unauthorized")
export const notFound = (what = "Resource") =>
  new ApiError(404, `${what} not found`, "not_found")
export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, message, "bad_request", details)

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status }
    )
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: error.issues[0]?.message ?? "Invalid input",
          details: z.flattenError(error),
        },
      },
      { status: 400 }
    )
  }
  console.error("[api] unhandled error", error)
  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong" } },
    { status: 500 }
  )
}

/** Wraps a route handler so thrown ApiError/ZodError become JSON responses. */
export function route<Ctx = unknown>(
  handler: (request: NextRequest, ctx: Ctx) => Promise<Response>
) {
  return async (request: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      return await handler(request, ctx)
    } catch (error) {
      // Let Next.js handle its own control-flow errors (redirect, notFound).
      if (
        error instanceof Error &&
        "digest" in error &&
        typeof error.digest === "string" &&
        error.digest.startsWith("NEXT_")
      ) {
        throw error
      }
      return errorResponse(error)
    }
  }
}

export async function parseBody<T>(request: Request, schema: ZodType<T>) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw badRequest("Request body must be JSON")
  }
  return schema.parse(body)
}

export function parseQuery<T>(request: NextRequest, schema: ZodType<T>) {
  const params: Record<string, string> = {}
  request.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value
  })
  return schema.parse(params)
}

export function parseId(id: string) {
  const parsed = z.uuid().safeParse(id)
  if (!parsed.success) throw notFound()
  return parsed.data
}
