import {
  CircleDotIcon,
  FileCodeIcon,
  GitForkIcon,
  GitMergeIcon,
  GitPullRequestIcon,
  MessageSquareIcon,
  StarIcon,
} from "lucide-react"

import { compactNumber, formatRelative } from "@/lib/format"
import type { ResourceDto } from "@/lib/resources/dto"
import { displayTitle } from "@/lib/resources/dto"
import { cn } from "@/lib/utils"

import { GithubMark } from "../type-icon"

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  Ruby: "#701516",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  "C++": "#f34b7d",
  C: "#555555",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
}

function StateBadge({
  kind,
  state,
}: {
  kind: "issue" | "pull"
  state?: string
}) {
  const merged = state === "merged"
  const open = state === "open"
  const Icon =
    kind === "pull"
      ? merged
        ? GitMergeIcon
        : GitPullRequestIcon
      : CircleDotIcon
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium capitalize",
        merged
          ? "bg-violet-500/15 text-violet-300"
          : open
            ? "bg-emerald-500/15 text-emerald-300"
            : "bg-white/10 text-text-muted"
      )}
    >
      <Icon className="size-3" />
      {state ?? "unknown"}
    </span>
  )
}

export function GithubStats({
  resource,
  className,
}: {
  resource: ResourceDto
  className?: string
}) {
  const gh = resource.metadata.github
  if (!gh) return null
  if (gh.kind === "repo") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted",
          className
        )}
      >
        {gh.language ? (
          <span className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ background: LANGUAGE_COLORS[gh.language] ?? "#8a8a8a" }}
            />
            {gh.language}
          </span>
        ) : null}
        {gh.stars != null ? (
          <span className="flex items-center gap-1">
            <StarIcon className="size-3.5" />
            {compactNumber(gh.stars)}
          </span>
        ) : null}
        {gh.forks != null ? (
          <span className="flex items-center gap-1">
            <GitForkIcon className="size-3.5" />
            {compactNumber(gh.forks)}
          </span>
        ) : null}
        {gh.pushedAt ? (
          <span>Updated {formatRelative(gh.pushedAt)}</span>
        ) : null}
      </div>
    )
  }
  if (gh.kind === "gist") {
    return (
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {(gh.files ?? []).slice(0, 4).map((f) => (
          <span
            key={f.name}
            className="inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-text-muted"
          >
            <FileCodeIcon className="size-3" />
            {f.name}
          </span>
        ))}
      </div>
    )
  }
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 text-xs text-text-muted",
        className
      )}
    >
      <StateBadge kind={gh.kind} state={gh.state} />
      {gh.comments != null ? (
        <span className="flex items-center gap-1">
          <MessageSquareIcon className="size-3.5" />
          {gh.comments}
        </span>
      ) : null}
      {(gh.labels ?? []).slice(0, 4).map((l) => (
        <span
          key={l.name}
          className="rounded-full border px-1.5 text-[11px]"
          style={{
            borderColor: l.color ? `#${l.color}66` : undefined,
            color: l.color ? `#${l.color}` : undefined,
          }}
        >
          {l.name}
        </span>
      ))}
    </div>
  )
}

export function GithubCardBody({ resource }: { resource: ResourceDto }) {
  const gh = resource.metadata.github
  const heading =
    gh?.kind === "repo" && gh.repo
      ? `${gh.owner}/${gh.repo}`
      : gh?.kind === "issue" || gh?.kind === "pull"
        ? `${gh.owner}/${gh.repo} #${gh.number}`
        : gh?.kind === "gist"
          ? `gist${gh.owner ? ` · ${gh.owner}` : ""}`
          : "GitHub"
  const title = displayTitle(resource)
  return (
    <div className="space-y-2.5 p-3">
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <GithubMark className="size-4 text-foreground" />
        <span className="truncate font-mono">{heading}</span>
      </div>
      {gh?.kind !== "repo" || title !== heading ? (
        <h3 className="line-clamp-2 text-[15px] leading-snug font-medium">
          {title}
        </h3>
      ) : null}
      {resource.metadata.description ? (
        <p className="line-clamp-3 text-sm text-text-muted">
          {resource.metadata.description}
        </p>
      ) : null}
      {gh?.kind === "repo" && gh.topics?.length ? (
        <div className="flex flex-wrap gap-1">
          {gh.topics.slice(0, 5).map((t) => (
            <span
              key={t}
              className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-300"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
      <GithubStats resource={resource} />
    </div>
  )
}
