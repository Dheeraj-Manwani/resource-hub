import { AppShell } from "@/components/shell/app-shell"
import { requireUser } from "@/lib/server/dal/session"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  return <AppShell user={user}>{children}</AppShell>
}
