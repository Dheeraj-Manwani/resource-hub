import { redirect } from "next/navigation"

import { SignInButton } from "@/components/sign-in-button"
import { LogoMark } from "@/components/logo"
import { getCurrentUser } from "@/lib/server/dal/session"
import { safeNext } from "@/lib/safe-next"

const ERRORS: Record<string, string> = {
  access_denied: "Sign-in was cancelled.",
}

export default async function LandingPage(props: PageProps<"/">) {
  const searchParams = await props.searchParams
  const next = safeNext(searchParams.next)
  const user = await getCurrentUser()
  if (user) redirect(next)

  const errorCode =
    typeof searchParams.error === "string" ? searchParams.error : null
  const error = errorCode
    ? (ERRORS[errorCode] ?? "Sign-in failed. Please try again.")
    : null

  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-20%] mx-auto h-[480px] max-w-3xl rounded-full bg-brand/10 blur-[120px]"
      />
      <div className="relative flex w-full max-w-sm flex-col items-center text-center">
        <LogoMark className="size-12" />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          Resource Hub
        </h1>
        <p className="mt-3 text-balance text-text-muted">
          Everything you save online, rendered and playable in one place, with
          projects, tasks and a calendar on top.
        </p>
        <SignInButton next={next} className="mt-8 w-full" />
        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <p className="mt-10 text-xs text-subtle">
          Your library is private to your account
        </p>
      </div>
    </main>
  )
}
