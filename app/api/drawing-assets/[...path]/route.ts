import { readFile } from "node:fs/promises"
import { join } from "node:path"

/** Serve bundled fonts from our own origin under the existing font CSP. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  if (
    path.length !== 3 ||
    path[0] !== "fonts" ||
    !/^[A-Za-z]+$/.test(path[1]) ||
    !/^[A-Za-z0-9.-]+\.woff2$/.test(path[2])
  )
    return new Response(null, { status: 404 })
  try {
    const bytes = await readFile(
      join(
        process.cwd(),
        "node_modules/@excalidraw/excalidraw/dist/prod",
        ...path
      )
    )
    return new Response(bytes, {
      headers: {
        "Content-Type": "font/woff2",
        "Cache-Control": "public, max-age=86400",
      },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}
