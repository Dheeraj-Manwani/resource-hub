"use client"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, ApiClientError } from "@/lib/api-client"
import { showToast } from "@/lib/toast"
import {
  applyTimerCommand,
  isActiveTimer,
  type HabitTimer,
  type TimerCommand,
  type TimerSnapshot,
} from "@/lib/habits/timer"
import {
  readStoredTimer,
  writeStoredTimer,
  subscribeTimerStorage,
  type StoredTimer,
} from "@/lib/habits/timer-storage"
import type { Habit } from "@/lib/habits/model"
import { useSyncController } from "@/components/sync-provider"
import { invalidateHabitViews } from "@/hooks/queries/habits"
type CommandInput =
  | { action: "pause" | "resume" | "review" | "discard" }
  | { action: "add_time"; minutes: number }
  | { action: "finish"; confirmedMs: number; notes: string }
type TimerContextValue = {
  session: HabitTimer | null
  now: number
  pending: boolean
  busy: boolean
  online: boolean
  notice: string
  recovered: boolean
  start: (
    habit: Habit,
    mode: "countdown" | "stopwatch",
    minutes: number
  ) => Promise<void>
  command: (input: CommandInput) => void
  reviewLatest: () => void
  downloadDraft: () => void
  unsentFinish: Extract<TimerCommand, { action: "finish" }> | undefined
  conflict: boolean
  startHabit: Habit | null
  chooseHabit: (habit: Habit | null) => void
}
const TimerContext = createContext<TimerContextValue | null>(null)
function projectTimer(
  session: HabitTimer | null,
  commands: TimerCommand[],
  now: number
) {
  let current = session
  if (!current) return null
  try {
    for (const command of commands)
      current = applyTimerCommand(current, command, Math.max(now, command.at))
  } catch {
    /* A conflict keeps the last valid draft visible. */
  }
  return current
}
export function useHabitTimer() {
  const value = useContext(TimerContext)
  if (!value) throw new Error("Habit timer provider is missing")
  return value
}
export function HabitTimerProvider({
  userId,
  children,
}: {
  userId: string
  children: ReactNode
}) {
  const client = useQueryClient()
  const sync = useSyncController()
  const stored = useSyncExternalStore(
    subscribeTimerStorage,
    () => readStoredTimer(userId),
    () => null
  )
  const [now, setNow] = useState(() => Date.now())
  const [online, setOnline] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [startHabit, chooseHabit] = useState<Habit | null>(null)
  const [startedId, setStartedId] = useState<string | null>(null)
  const processing = useRef(false)
  const retryAfter = useRef(0)
  const failures = useRef(0)
  const query = useQuery({
    queryKey: ["habit-timer", userId],
    queryFn: ({ signal }) =>
      api<TimerSnapshot>("/api/v1/habits/timer", { signal }),
    refetchInterval: (query) => (query.state.data?.session ? 3000 : 10000),
    refetchIntervalInBackground: true,
  })
  const channel = useRef<BroadcastChannel | null>(null)
  const notify = useCallback(() => {
    channel.current?.postMessage("changed")
    void client.invalidateQueries({ queryKey: ["habit-timer", userId] })
  }, [client, userId])
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    const current = new BroadcastChannel(`habit-timer:${userId}`)
    channel.current = current
    current.onmessage = () =>
      void client.invalidateQueries({ queryKey: ["habit-timer", userId] })
    return () => {
      current.close()
      channel.current = null
    }
  }, [client, userId])
  useEffect(() => {
    if (!query.data) return
    const previous = readStoredTimer(userId)
    if (previous?.commands.length) return
    if (
      previous?.snapshot.session &&
      query.data.session?.id === previous.snapshot.session.id &&
      query.data.session.revision < previous.snapshot.session.revision
    )
      return
    try {
      writeStoredTimer(
        userId,
        query.data.session
          ? { snapshot: query.data, localSavedAt: Date.now(), commands: [] }
          : null
      )
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : "Couldn't preserve timer locally",
        {}
      )
    }
  }, [query.data, userId])
  const flush = useCallback(async () => {
    const initial = readStoredTimer(userId)
    if (
      processing.current ||
      !navigator.onLine ||
      Date.now() < retryAfter.current ||
      !initial?.commands.length ||
      initial.conflict
    )
      return
    processing.current = true
    try {
      while (navigator.onLine) {
        const current = readStoredTimer(userId)
        const first = current?.commands[0]
        const timer = current?.snapshot.session
        if (!first || !timer || current.conflict) break
        await client.cancelQueries({ queryKey: ["habit-timer", userId] })
        const result = await api<
          TimerSnapshot & { saved: boolean; completed: boolean }
        >(`/api/v1/habits/timer/${timer.id}`, { method: "PATCH", body: first })
        const latest = readStoredTimer(userId)
        if (latest?.commands[0]?.id === first.id)
          writeStoredTimer(userId, {
            snapshot: result,
            localSavedAt: Date.now(),
            commands: latest.commands.slice(1),
          })
        client.setQueryData(
          ["habit-timer", userId],
          result.session && isActiveTimer(result.session.status)
            ? result
            : { session: null, serverNow: result.serverNow }
        )
        failures.current = 0
        retryAfter.current = 0
        setNotice("")
        if (first.action === "finish") {
          await invalidateHabitViews(client)
          if (result.saved)
            showToast(
              result.completed ? `${timer.name}: goal met!` : "Session saved",
              {
                description:
                  timer.goal.goalType === "minutes"
                    ? "Your working time is now recorded."
                    : "Time recorded. Log your quantity or completion separately.",
              },
              "success"
            )
        }
        if (first.action === "discard")
          showToast("Session discarded", {
            description: "No progress was added.",
          })
        notify()
      }
    } catch (cause) {
      const current = readStoredTimer(userId)
      if (
        cause instanceof ApiClientError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 429
      ) {
        if (current)
          writeStoredTimer(userId, { ...current, conflict: cause.message })
        setNotice(`${cause.message} Your unsent change is kept on this device.`)
        notify()
      } else {
        failures.current++
        retryAfter.current =
          Date.now() +
          Math.min(30000, 2000 * 2 ** Math.min(failures.current, 4))
        setNotice("Saved on this device. Reconnect to sync this change.")
      }
    } finally {
      processing.current = false
    }
  }, [client, notify, userId])
  useEffect(() => {
    const update = () => {
      setNow(Date.now())
      setOnline(navigator.onLine)
      void flush()
    }
    const interval = window.setInterval(update, 1000)
    const reconnect = () => {
      retryAfter.current = 0
      update()
      notify()
    }
    window.addEventListener("online", reconnect)
    window.addEventListener("offline", update)
    return () => {
      clearInterval(interval)
      window.removeEventListener("online", reconnect)
      window.removeEventListener("offline", update)
    }
  }, [flush, notify])
  const snapshot = stored?.snapshot ?? query.data
  const clockOffset = stored
    ? stored.snapshot.serverNow - stored.localSavedAt
    : 0
  const serverNow = now + clockOffset
  const pending = !!stored?.commands.length
  useEffect(() => {
    const id = `habit-timer:${userId}`
    if (pending) {
      sync.queue("Syncing habit timer", id, [
        `habit:${stored?.snapshot.session?.habitId ?? "all"}`,
      ])
      sync.store.getState().update(id, {
        phase: stored?.conflict ? "failed" : online ? "writing" : "paused",
        href: "/habits",
        message: stored?.conflict,
      })
    } else sync.finish(id)
  }, [
    pending,
    stored?.conflict,
    stored?.snapshot.session?.habitId,
    online,
    sync,
    userId,
  ])
  const projected = projectTimer(
    snapshot?.session ?? null,
    stored?.commands ?? [],
    serverNow
  )
  const session =
    projected && (isActiveTimer(projected.status) || pending) ? projected : null
  async function start(
    habit: Habit,
    mode: "countdown" | "stopwatch",
    minutes: number
  ) {
    if (!navigator.onLine)
      throw new Error(
        "Connect to start a timer. An existing timer can still be paused or saved offline."
      )
    if (readStoredTimer(userId)?.commands.length)
      throw new Error(
        "Sync the pending timer change before starting another session"
      )
    setBusy(true)
    try {
      await client.cancelQueries({ queryKey: ["habit-timer", userId] })
      const result = await api<TimerSnapshot>("/api/v1/habits/timer", {
        method: "POST",
        body: { id: crypto.randomUUID(), habitId: habit.id, mode, minutes },
      })
      setStartedId(result.session?.id ?? null)
      writeStoredTimer(userId, {
        snapshot: result,
        localSavedAt: Date.now(),
        commands: [],
      })
      client.setQueryData(["habit-timer", userId], result)
      await client.invalidateQueries({ queryKey: ["habits"] })
      notify()
      chooseHabit(null)
      setNotice("")
    } catch (cause) {
      notify()
      throw cause
    } finally {
      setBusy(false)
    }
  }
  const sendCommand = useCallback(
    (input: CommandInput) => {
      const latest = readStoredTimer(userId)
      if (!session || latest?.conflict) return
      const offset = latest
        ? latest.snapshot.serverNow - latest.localSavedAt
        : 0
      let current = latest?.snapshot.session ?? session
      try {
        for (const queued of latest?.commands ?? [])
          current = applyTimerCommand(
            current,
            queued,
            Math.max(Date.now() + offset, queued.at)
          )
      } catch {
        setNotice("Review the pending timer change before continuing")
        return
      }
      const body = {
        ...input,
        id: crypto.randomUUID(),
        expectedRevision: current.revision,
        at: Date.now() + offset,
      } as TimerCommand
      try {
        applyTimerCommand(current, body, body.at)
        const base: StoredTimer = latest ?? {
          snapshot: { session, serverNow: body.at },
          localSavedAt: Date.now(),
          commands: [],
        }
        writeStoredTimer(userId, {
          ...base,
          commands: [...base.commands, body],
        })
        if (!navigator.onLine)
          setNotice("Saved on this device. Reconnect to sync this change.")
        void flush()
      } catch (cause) {
        setNotice(
          cause instanceof Error ? cause.message : "Couldn't save timer change"
        )
      }
    },
    [session, userId, flush]
  )
  async function reviewLatest() {
    // Explicit reconciliation; retain the draft if fetching current state fails.
    setBusy(true)
    try {
      await client.cancelQueries({ queryKey: ["habit-timer", userId] })
      const latest = await client.fetchQuery({
        queryKey: ["habit-timer", userId],
        queryFn: ({ signal }) =>
          api<TimerSnapshot>("/api/v1/habits/timer", { signal }),
        staleTime: 0,
      })
      writeStoredTimer(
        userId,
        latest.session
          ? { snapshot: latest, localSavedAt: Date.now(), commands: [] }
          : null
      )
      setNotice("Using the latest timer. Review tracked time before saving.")
      setStartedId(null)
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : "Couldn't load the latest timer. Your unsent work is still kept here."
      )
    } finally {
      setBusy(false)
    }
  }
  function downloadDraft() {
    const draft = readStoredTimer(userId)
    if (!draft) return
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(draft, null, 2)], {
        type: "application/json",
      })
    )
    const link = document.createElement("a")
    link.href = url
    link.download = `habit-session-${draft.snapshot.session?.id ?? "draft"}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <TimerContext.Provider
      value={{
        session,
        now: serverNow,
        pending,
        busy,
        online,
        notice,
        recovered: !!session && session.id !== startedId,
        start,
        command: sendCommand,
        reviewLatest,
        downloadDraft,
        unsentFinish: stored?.commands.findLast(
          (command) => command.action === "finish"
        ) as Extract<TimerCommand, { action: "finish" }> | undefined,
        conflict: !!stored?.conflict,
        startHabit,
        chooseHabit,
      }}
    >
      {children}
    </TimerContext.Provider>
  )
}
