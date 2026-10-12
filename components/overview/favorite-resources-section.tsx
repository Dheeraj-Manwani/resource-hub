"use client"

import { QueryFeedback } from "@/components/query-feedback"
import { useOverviewSection } from "@/hooks/queries/overview"
import { OverviewResourceRow } from "./resources-to-review-section"
import type { OverviewSectionProps } from "./section-context"
import { PageLink, SectionHeader } from "./section-ui"

export function FavoriteResourcesSection({
  data,
  actions,
}: OverviewSectionProps) {
  const query = useOverviewSection("favorite-resources")
  return (
    <section aria-label="Favorite resources">
      <SectionHeader title="Favorite resources">
        <PageLink href="/resources?favorite=true">All favorites</PageLink>
      </SectionHeader>
      <QueryFeedback query={query} label="favorite resources" />
      {query.data &&
        (query.data.items.length ? (
          query.data.items.map((resource) => (
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
      {query.data?.hasMore && (
        <p className="mt-3 text-xs text-subtle">
          Showing your five most recently updated favorites.
        </p>
      )}
    </section>
  )
}
