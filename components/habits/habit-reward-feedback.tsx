"use client"
import { useEffect, useState } from "react"
import { AwardIcon, CheckIcon, XIcon } from "lucide-react"
import { useHabitPreferences } from "@/hooks/queries/habits"
import type { HabitRewardEvent } from "@/lib/habits/motivation"

export async function playHabitChime() {
  try {
    if (typeof AudioContext === "undefined") return
    const audio = new AudioContext()
    await audio.resume()
    if (audio.state !== "running") {
      await audio.close()
      return
    }
    const gain = audio.createGain()
    gain.connect(audio.destination)
    gain.gain.setValueAtTime(0, audio.currentTime)
    gain.gain.linearRampToValueAtTime(0.045, audio.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.5)
    const oscillator = audio.createOscillator()
    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(523.25, audio.currentTime)
    oscillator.frequency.setValueAtTime(659.25, audio.currentTime + 0.16)
    oscillator.connect(gain)
    oscillator.start()
    oscillator.stop(audio.currentTime + 0.5)
    oscillator.onended = () => {
      void audio.close()
    }
  } catch {
    /* Browser audio support never affects recording. */
  }
}
export function HabitRewardFeedback() {
  const { data: preferences } = useHabitPreferences()
  const [reward, setReward] = useState<
    (HabitRewardEvent & { token: number }) | null
  >(null)
  useEffect(() => {
    function receive(event: Event) {
      const value = (event as CustomEvent<HabitRewardEvent>).detail
      if (
        !preferences ||
        preferences.quiet ||
        !preferences.celebrations ||
        (!value.completed && !value.milestones.length && !value.returning)
      )
        return
      setReward({ ...value, token: Date.now() })
      if (preferences.sound && (value.completed || value.milestones.length))
        void playHabitChime()
    }
    window.addEventListener("habit-reward", receive)
    return () => window.removeEventListener("habit-reward", receive)
  }, [preferences])
  useEffect(() => {
    if (!reward) return
    const timeout = setTimeout(
      () => setReward(null),
      preferences?.quiet || !preferences?.celebrations ? 0 : 6500
    )
    return () => clearTimeout(timeout)
  }, [reward, preferences?.quiet, preferences?.celebrations])
  if (!reward || preferences?.quiet || !preferences?.celebrations) return null
  return (
    <aside
      key={reward.token}
      role="status"
      aria-label="Habit reward"
      className="habit-reward-enter pointer-events-none fixed top-20 left-1/2 z-50 w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-brand/40 bg-card p-5 shadow-xl"
    >
      <button
        className="pointer-events-auto absolute top-2 right-2 grid size-11 place-items-center rounded-lg hover:bg-muted"
        aria-label="Dismiss habit reward"
        onClick={() => setReward(null)}
      >
        <XIcon className="size-4" />
      </button>
      <div className="flex items-center gap-3 pr-8">
        <span className="habit-reward-mark grid size-12 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
          {reward.milestones.length ? (
            <AwardIcon aria-hidden />
          ) : (
            <CheckIcon aria-hidden />
          )}
        </span>
        <div>
          <p className="text-xs text-text-muted">{reward.name}</p>
          <p className="text-lg font-semibold">
            {reward.completed
              ? "Goal met. A promise kept."
              : reward.returning
                ? "Good to have you back."
                : "A step worth keeping."}
          </p>
        </div>
      </div>
      {reward.returning && (
        <p className="mt-3 text-sm text-text-muted">
          Your earlier work is still here. Today’s effort adds to it.
        </p>
      )}
      {reward.milestones.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {reward.milestones.map((b) => (
            <span
              className="rounded-full border bg-brand-soft px-3 py-1 text-sm text-brand"
              key={b.id}
            >
              {b.title}
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-text-muted">
        Saved to your habit. See your journey in Your work.
      </p>
    </aside>
  )
}
