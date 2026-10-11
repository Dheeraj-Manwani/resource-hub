import {
  timerCommandSchema,
  type TimerCommand,
  type TimerSnapshot,
} from "./timer"
export type StoredTimer = {
  snapshot: TimerSnapshot
  localSavedAt: number
  commands: TimerCommand[]
  conflict?: string
}
const cache = new Map<
  string,
  { raw: string | null; value: StoredTimer | null }
>()
const key = (userId: string) => `resource:habit-timer:v1:${userId}`
export function readStoredTimer(userId: string): StoredTimer | null {
  if (typeof window === "undefined") return null
  let raw: string | null
  try {
    raw = localStorage.getItem(key(userId))
  } catch {
    return null
  }
  const previous = cache.get(userId)
  if (previous?.raw === raw) return previous.value
  let value: StoredTimer | null = null
  try {
    const parsed = JSON.parse(raw ?? "null") as StoredTimer | null
    if (
      parsed?.snapshot?.session &&
      typeof parsed.localSavedAt === "number" &&
      typeof parsed.snapshot.serverNow === "number" &&
      Array.isArray(parsed.snapshot.session.segments) &&
      Array.isArray(parsed.commands) &&
      parsed.commands.every(
        (command) => timerCommandSchema.safeParse(command).success
      )
    )
      value = parsed
  } catch {}
  cache.set(userId, { raw, value })
  return value
}
export function writeStoredTimer(userId: string, value: StoredTimer | null) {
  const raw = value ? JSON.stringify(value) : null
  try {
    if (raw) localStorage.setItem(key(userId), raw)
    else localStorage.removeItem(key(userId))
  } catch {
    throw new Error(
      "The browser could not save this timer change. Free some browser storage and try again."
    )
  }
  cache.set(userId, { raw, value })
  window.dispatchEvent(new Event("habit-timer-storage"))
}
export function subscribeTimerStorage(listener: () => void) {
  window.addEventListener("storage", listener)
  window.addEventListener("habit-timer-storage", listener)
  return () => {
    window.removeEventListener("storage", listener)
    window.removeEventListener("habit-timer-storage", listener)
  }
}
