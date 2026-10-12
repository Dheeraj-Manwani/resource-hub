"use client"

import { overviewSectionLimit } from "@/lib/overview/sections"

import { QueryFeedback } from "@/components/query-feedback"
import { useOverviewSection } from "@/hooks/queries/overview"
import { OverviewResourceRow } from "./resources-to-review-section"
import type { OverviewSectionProps } from "./section-context"
import { countLabel, PageLink, SectionHeader } from "./section-ui"

export function FavoriteResourcesSection({
  data,
  actions,
  options,
}: OverviewSectionProps) {
  const limit = overviewSectionLimit("favorite-resources", options)
  const query = useOverviewSection("favorite-resources")
  return (
    <section aria-label="Favorite resources">
      <SectionHeader title="Favorite resources">
        <PageLink href="/resources?favorite=true">All favorites</PageLink>
      </SectionHeader>
      <QueryFeedback query={query} label="favorite resources" />
      {query.data &&
        (query.data.items.length ? (
          query.data.items
            .slice(0, limit)
            .map((resource) => (
              <OverviewResourceRow
                key={resource.id}
                resource={resource}
                data={data}
                openResource={actions.openResource}
                openPreview={actions.openPreview}
                mode="favorite"
              />
            ))
        ) : (
          <p className="py-4 text-sm text-text-muted">
            Star a resource to keep it close at hand.
          </p>
        ))}
      {query.data &&
        (query.data.hasMore || query.data.items.length > limit) && (
          <p className="mt-3 text-xs text-subtle">
            Showing{" "}
            {countLabel(Math.min(limit, query.data.items.length), "favorite")}{" "}
            by most recent update.
          </p>
        )}
    </section>
  )
}
