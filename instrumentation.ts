export async function register() {
  // Fail fast at boot (not during `next build`) when env vars are missing.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { serverEnv } = await import("@/lib/env")
    serverEnv()
  }
}
