import { getSessionCookie } from "better-auth/cookies"
import { NextResponse, type NextRequest } from "next/server"

// Optimistic check only (cookie presence). Real authorization happens in
// every page (requireUser) and route handler (requireApiUser).
const PUBLIC_PATHS = ["/", "/api/v1/capture"]

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/api/auth/")) {
    return NextResponse.next()
  }
  if (getSessionCookie(request)) return NextResponse.next()

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Not signed in" } },
      { status: 401 }
    )
  }
  const url = new URL("/", request.url)
  url.searchParams.set("next", `${pathname}${search}`)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|icons/|.*\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml)$).*)",
  ],
}
