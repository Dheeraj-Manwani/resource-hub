import type { Metadata } from "next"
import { HabitsView } from "@/components/habits/habits-view"
export const metadata: Metadata = { title: "Habits" }
export default function HabitsPage() {
  return <HabitsView />
}
