import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { CalendarSettings } from "@/components/settings/calendar-settings"
import { CaptureSettings } from "@/components/settings/capture-settings"
import { StorageSettings } from "@/components/settings/storage-settings"
import { TokenSettings } from "@/components/settings/token-settings"
import { serverEnv } from "@/lib/env"
import { getSettings } from "@/lib/server/dal/settings"
import { requireUser } from "@/lib/server/dal/session"

export const metadata: Metadata = { title: "Settings" }

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-4 border-t border-border py-8 md:grid-cols-[260px_1fr]">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

export default async function SettingsPage() {
  const user = await requireUser()
  const appUrl = serverEnv().BETTER_AUTH_URL.replace(/\/$/, "")
  const settings = await getSettings(user.id)
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" />
      <Section title="Account" description="Signed in with Google.">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-subtle">Name</dt>
          <dd>{user.name}</dd>
          <dt className="text-subtle">Email</dt>
          <dd>{user.email}</dd>
        </dl>
      </Section>
      <Section
        title="Calendar"
        description="Timezone, week start, and a subscribable feed of your tasks."
      >
        <CalendarSettings appUrl={appUrl} initialSettings={settings} />
      </Section>
      <Section
        title="Capture"
        description="Save things from anywhere into your Inbox."
      >
        <CaptureSettings appUrl={appUrl} />
      </Section>
      <Section
        title="Personal tokens"
        description="For the iOS Shortcut and scripts. Tokens can only capture into your Inbox; revoke any you no longer use."
      >
        <TokenSettings appUrl={appUrl} />
      </Section>
      <Section
        title="Storage and data"
        description="Sign-up is open to any Google account, so storage has a per-account cap."
      >
        <StorageSettings />
      </Section>
    </div>
  )
}
