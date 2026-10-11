import type { Metadata } from "next"
import { HabitsView } from "@/components/habits/habits-view"
import { z } from "zod"
import { dateSchema } from "@/lib/habits/model"
export const metadata: Metadata = { title: "Habits" }
export default async function HabitsPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string; date?: string }>
}) {
  const params = await searchParams
  const id = z.uuid().safeParse(params.h),
    date = dateSchema.safeParse(params.date)
  return (
    <HabitsView
      key={`${params.h ?? ""}:${params.date ?? ""}`}
      initialHabitId={id.success ? id.data : null}
      initialDate={date.success ? date.data : ""}
    />
  )
}
