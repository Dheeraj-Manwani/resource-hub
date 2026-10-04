"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { KeyRoundIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "react-hot-toast"

import { CopyButton } from "@/components/resources/cards/type-cards"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api-client"
import { formatDate, formatRelative } from "@/lib/format"
import type { ApiTokenDto } from "@/lib/server/dal/tokens"

export function TokenSettings({ appUrl }: { appUrl: string }) {
  const qc = useQueryClient()
  const [name, setName] = useState("iPhone Shortcut")
  const [created, setCreated] = useState<string | null>(null)
  const tokens = useQuery({
    queryKey: ["tokens"],
    queryFn: ({ signal }) =>
      api<{ items: ApiTokenDto[] }>("/api/v1/tokens", { signal }),
    select: (d) => d.items,
  })
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string; token: string }>("/api/v1/tokens", {
        method: "POST",
        body: { name },
      }),
    onSuccess: ({ token }) => {
      setCreated(token)
      toast.success("Token created — copy it now")
      void qc.invalidateQueries({ queryKey: ["tokens"] })
    },
    onError: (e) => toast.error(e.message),
  })
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api<null>(`/api/v1/tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Token revoked")
      void qc.invalidateQueries({ queryKey: ["tokens"] })
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="space-y-4 text-sm">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) create.mutate()
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name"
          aria-label="Token name"
          className="max-w-xs"
        />
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          {create.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <KeyRoundIcon />
          )}
          Create token
        </Button>
      </form>

      {created ? (
        <div className="space-y-2 rounded-lg border border-brand/40 bg-brand-soft p-3">
          <p className="font-medium">
            Copy this token now — it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-bg-sunken px-2 py-1.5 font-mono text-xs">
              {created}
            </code>
            <CopyButton text={created} />
          </div>
          <p className="text-xs text-text-muted">
            Test it:{" "}
            <code className="font-mono">
              curl -X POST {appUrl}/api/v1/capture -H &quot;Authorization:
              Bearer …&quot; -H &quot;Content-Type: application/json&quot; -d
              &apos;{`{"url":"https://example.com"}`}&apos;
            </code>
          </p>
        </div>
      ) : null}

      {tokens.isPending ? (
        <p className="text-subtle">Loading…</p>
      ) : tokens.data?.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {tokens.data.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
              <KeyRoundIcon className="size-4 text-subtle" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{t.name}</p>
                <p className="text-xs text-subtle">
                  <span className="font-mono">{t.prefix}…</span> · created{" "}
                  {formatDate(t.createdAt)} ·{" "}
                  {t.lastUsedAt
                    ? `last used ${formatRelative(t.lastUsedAt)}`
                    : "never used"}
                </p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Revoke ${t.name}`}
                className="hover:text-destructive"
                onClick={() => revoke.mutate(t.id)}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-subtle">No tokens yet.</p>
      )}
    </div>
  )
}
