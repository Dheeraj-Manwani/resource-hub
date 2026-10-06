"use client"

import { DownloadIcon, RefreshCwIcon } from "lucide-react"

import { CopyButton } from "@/components/resources/cards/type-cards"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  useRegenerateIcsToken,
  useSettings,
  useUpdateSettings,
} from "@/hooks/queries/settings"
import type { SettingsDto } from "@/lib/server/dal/settings"

const TIMEZONES =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["UTC"]

export function CalendarSettings({
  appUrl,
  initialSettings,
}: {
  appUrl: string
  initialSettings: SettingsDto
}) {
  const { data: settings } = useSettings(initialSettings)
  const update = useUpdateSettings()
  const regenerate = useRegenerateIcsToken()
  const current = settings ?? initialSettings
  const feedUrl = current.icsToken
    ? `${appUrl}/api/calendar/${current.icsToken}.ics`
    : null

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="text-text-muted">Timezone</span>
          <input
            list="timezones"
            defaultValue={current.timezone}
            onBlur={(e) => {
              if (
                TIMEZONES.includes(e.target.value) &&
                e.target.value !== current.timezone
              ) {
                update.mutate({ timezone: e.target.value })
              }
            }}
            className="h-8 w-56 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <datalist id="timezones">
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-text-muted">Week starts</span>
          <Select
            value={String(current.weekStart)}
            onValueChange={(v: string | null) =>
              v && update.mutate({ weekStart: Number(v) })
            }
          >
            <SelectTrigger size="sm">
              <SelectValue>
                {(v: string) => (v === "0" ? "Sunday" : "Monday")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Sunday</SelectItem>
              <SelectItem value="1">Monday</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="font-medium">Subscribe in your calendar app</p>
        {feedUrl ? (
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-bg-sunken px-2 py-1.5 font-mono text-xs">
              {feedUrl}
            </code>
            <CopyButton text={feedUrl} />
          </div>
        ) : (
          <p className="text-text-muted">
            No feed yet — generate one to get a subscribe link.
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            loading={regenerate.isPending}
            onClick={() => regenerate.mutate()}
          >
            <RefreshCwIcon />
            {feedUrl ? "Regenerate (revokes old link)" : "Generate feed"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <a href="/api/v1/calendar/export.ics" download="tasks.ics" />
            }
          >
            <DownloadIcon />
            Download .ics
          </Button>
        </div>
      </div>
    </div>
  )
}
