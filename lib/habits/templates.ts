import { defaultConfig, type HabitInput } from "./model"

export const habitStarters = [
  {
    id: "reading",
    label: "Reading",
    description: "15 minutes each day",
    name: "Read a little",
    icon: "📖",
    color: "orange",
    config: { target: 15, defaultDuration: 15 },
  },
  {
    id: "movement",
    label: "Movement",
    description: "20 minutes on any 3 days a week",
    name: "Make time to move",
    icon: "🏃",
    color: "green",
    config: {
      target: 20,
      defaultDuration: 20,
      schedule: "flexible",
      weeklyDays: 3,
    },
  },
  {
    id: "mindful",
    label: "Mindful pause",
    description: "5 minutes each day",
    name: "Take a mindful pause",
    icon: "🧘",
    color: "violet",
    config: { target: 5, defaultDuration: 5 },
  },
  {
    id: "practice",
    label: "Creative practice",
    description: "60 minutes across each week",
    name: "Practice something creative",
    icon: "🎨",
    color: "rose",
    config: { target: 60, defaultDuration: 25, goalPeriod: "week" },
  },
  {
    id: "quantity",
    label: "Read pages",
    description: "10 pages each day",
    name: "Read 10 pages",
    icon: "📖",
    color: "blue",
    config: {
      goalType: "quantity",
      target: 10,
      unit: "pages",
      defaultDuration: 15,
    },
  },
  {
    id: "reflection",
    label: "Daily reflection",
    description: "One reflection each day",
    name: "Reflect on my day",
    icon: "🌱",
    color: "green",
    config: { goalType: "done", target: 1, unit: "times", defaultDuration: 5 },
  },
] as const

/** Fresh editable input only: no identity, association, reminder or saved work. */
export function habitFromStarter(
  id: string,
  today: string,
  weekStart: number
): HabitInput | null {
  const starter = habitStarters.find((item) => item.id === id)
  if (!starter) return null
  return {
    name: starter.name,
    reason: "",
    icon: starter.icon,
    color: starter.color,
    config: { ...defaultConfig(today, weekStart), ...starter.config },
  }
}
