# Resource Hub: product review and implementation backlog

Reviewed 7 October 2026. Based on source inspection and primary-source web research. This is a proposal, not an implementation or a signed-in UI test. Priorities and effort are judgments, not measured business impact. S = localized change; M = several layers; L = substantial workflow or data-model work.

## Product direction

Resource Hub already combines nine resource types, rich previews, nested projects, task lists and boards, recurrence, calendar integration, tags, quick notes, capture, full-text search, bulk actions, optimistic updates, and sync feedback. Its next improvement should connect these capabilities into a repeatable loop: capture → review → connect → act → revisit.

The key distinction is between storing something and getting value from it. Project membership answers where something belongs; review state answers whether it has been processed; consumption state answers whether it has been read or watched; a task answers what action follows. Keep these separate.

Existing capabilities should be extended, not reintroduced as new features: the app already has a command palette, tag merging, duplicate checking during capture, resource–task links, bulk actions, calendar/ICS, trash for several entity types, JSON export, and metadata retries.

## Fixes and gaps grounded in the current source

### F01 — Task search only filters loaded pages

Priority: P1 · Effort: M · Evidence: confirmed source behavior.

`components/tasks/tasks-view.tsx:120` filters the accumulated `items` array using `titleFilter`. The title is not included in the server query. A matching task on an unloaded page is excluded from the result.

Fix: add a server-side title/full-text query to task validation and DAL filtering, include it in the query key, reset pagination when it changes, and debounce input. Keep status, priority and project filters composed with search.

Acceptance: create more than one page of tasks; a title found only on the final page must appear without manually loading earlier pages. Test rapid query changes and an empty result.

### F02 — Task board has no route to later pages

Priority: P1 · Effort: M · Evidence: confirmed source behavior; reproduce against a multi-page dataset.

`components/tasks/tasks-view.tsx` passes only loaded items to `TaskBoard`, while its Load more control at line 383 is restricted to list view. `components/tasks/task-board.tsx:125` also derives column counts from loaded items. A board opened on a large collection can omit tasks and understate column totals.

Fix: initially expose pagination on the board and distinguish loaded counts from totals; subsequently use independent pagination per status column. Avoid loading the entire collection merely to calculate counts.

Acceptance: all statuses remain accessible with several pages of tasks; empty-looking columns cannot conceal unloaded tasks; moves across columns update server totals and ordering.

### F03 — Quick notes are absent from global search

Priority: P1 · Effort: M · Evidence: confirmed schema/query gap.

`lib/validation/search.ts:5` supports resource, task, project and tag only. `lib/server/dal/search.ts` has no quick-note search branch. The command palette uses this endpoint.

Fix: index quick-note title and body text, add snippets and direct opening, and include quick notes in search facets and the command palette.

Acceptance: find a note by a phrase appearing only in its body; open the right note; another user's note never appears.

### F04 — Export is incomplete for quick-note users

Priority: P1 · Effort: M for structured export; L for portable restore · Evidence: confirmed export shape.

`lib/server/dal/export.ts:11` exports projects, resources, tasks and tags, but no quick notes. File references are not a portable archive of the actual file bytes. There is no import/restore endpoint in the inspected API inventory.

Fix: version the export format and include quick notes, stable relationship records, and a file manifest. Add an optional archive containing attachments, then an import preview with conflict policy and ID remapping. Do not include credentials or API tokens.

Acceptance: export a representative library, import into an empty test account, and compare entity counts, note bodies, attachments and relationships. Cover archived items and document whether trash is included. Perform export from a consistent snapshot or disclose snapshot limits.

### F05 — Quick notes have a different recovery contract

Priority: P1 · Effort: M · Evidence: confirmed behavior, explicitly disclosed by current UI.

`lib/server/dal/quick-notes.ts:117` permanently deletes rows. The UI warns about it. Resources, tasks and projects have Trash; quick notes do not. This is a product consistency gap, not an undisclosed deletion bug.

Fix: give notes soft delete, Trash restore, and undo; add document revisions later. Preserve images through the recovery window.

Acceptance: restore the same note identity and body with working images, including its project association when the project still exists.

### F06 — Inbox triage can diverge from the visible list

Priority: P1 · Effort: S–M · Evidence: strong source-level concern; not runtime-reproduced.

`components/resources/inbox-triage.tsx:22` creates its own unfiltered unsorted queue. The surrounding library may be filtered by type, tag, favorite or review state. Its Enter handler at line 72 also increments the numeric position while an optimistic resource move removes the current item from the queue.

Fix: pass the displayed queue and pagination into triage; track the selected item by ID; after removal keep the next remaining item at the current position. Suspend global triage shortcuts while a dialog owns focus.

Acceptance: filter to PDFs and file only PDFs; file A from [A,B,C] and focus B; test the first/last item, failures, undo, later pages and an open project picker.

### F07 — Note images need an explicit ownership and cleanup lifecycle

Priority: P2 · Effort: M · Evidence: code-supported maintenance risk; storage accumulation not measured.

Quick-note image completion marks a file ready without connecting it to a resource. Deleting the note only deletes its row. `sweepOrphanObjects` treats any object with a `files` row as known, so this sweep does not collect a ready file merely because no note references it.

Fix: track note–file references explicitly and garbage-collect only after checking every live document and retained revision, with a grace period for unfinished drafts.

Acceptance: removing the final reference eventually reclaims the object; shared images, drafts, restored notes and version history remain intact.

### F08 — Quick-note listing loads complete documents without pagination

Priority: P2 · Effort: M · Evidence: confirmed query shape, unmeasured performance risk.

`lib/server/dal/quick-notes.ts:68` selects all matching rows, including document bodies. The view maps all returned notes into cards.

Fix: return paginated summaries; fetch a full body only when opening a note; virtualize only if profiling shows a rendering bottleneck.

Acceptance: benchmark hundreds/thousands of notes with realistically sized documents and images. Track payload size, initial render time and editor-open latency.

### F09 — Board reordering is pointer-only

Priority: P2 · Effort: S–M · Evidence: `task-board.tsx:156` registers only PointerSensor.

Fix: add keyboard drag support and an explicit Move to status / Move before action that works without dragging, plus clear announcements. Other task-status editing may already provide a fallback; verify the complete journey.

Acceptance: change status and order using the keyboard alone, retain focus after mutation, and cover mobile touch targets.

### F10 — URL capture deduplication is vulnerable to concurrent requests

Priority: P2 · Effort: M · Evidence: source-level race; not stress-tested.

`app/api/v1/capture/route.ts` checks for an existing URL then creates it separately. `resources_user_url_idx` is a non-unique index. Concurrent captures can both pass the check.

Fix: enforce the intended invariant atomically for capture, using a transaction/advisory lock or an appropriately scoped unique constraint and conflict handling. First decide whether deliberate duplicate records are allowed elsewhere; preserve that policy and handle existing duplicates before migration.

Acceptance: simultaneous captures return the same canonical item; deleted URLs and deliberate duplicates follow explicit rules.

## Highest-value improvements

### I01 — Saved views across entity types

Priority: next after reliability fixes · Effort: M–L.

Save filters, layout, grouping, sort, visible columns and project scope. Pin views to the sidebar. Start with per-type views using a shared configuration model; add mixed results where genuinely useful.

Examples: Unread research for Project X; urgent tasks without a due date; unlinked notes; resources needing metadata repair. Provide AND/OR groups and negative filters such as no linked tasks, not just positive toggles.

Why now: resource and task filters are largely local component state; library layout is persisted, but a complete named view is not represented in the inspected settings schema. Saving a view removes repeated setup work.

Acceptance: save, reload, deep-link and edit a view; new matching items appear automatically. Schema-version saved filter definitions.

Inspiration: [Readwise filtered views](https://docs.readwise.io/reader/docs/faqs/filtered-views) and [Linear custom views](https://linear.app/docs/custom-views).

### I02 — Make the Inbox a processing queue

Effort: M.

Currently Inbox means no project membership (`resourceOverviewCounts` and `unsorted`). A deliberately independent resource can remain in Inbox forever, while an unprocessed resource can leave it simply by being filed.

Separate Unfiled from Needs review. Add one-action choices: keep as reference, create task, schedule reading, snooze, archive or discard. Let a useful independent resource leave the processing queue without forcing a project.

Acceptance: processing does not require filing; filing does not silently mark content read; snoozed items return on the intended date. Start with a bounded ten-item review session.

### I03 — Promote quick notes into useful work

Effort: M.

Add Convert to resource, Create task from selection, and Extract checklist. Preserve formatting, source note, images and project context. Present an explicit choice between retaining the source and archiving it; avoid silently destroying the original.

Example: select three action lines from a meeting scratchpad and create three linked tasks in the same project. Current quick-note copy promises eventual transformation, but the inspected note UI does not supply that workflow.

Acceptance: conversion is retry-safe and retains source links; undo does not delete a task subsequently edited elsewhere.

### I04 — A consistent connection panel

Effort: M initially; L for typed relations.

Build on existing task-resource and project-resource links. Every detail view should answer: Where is this used? What action came from it? What depends on it? Show backlinks in both directions and add entity mentions to the editor.

Later add explicit relations: supports, derived from, related to, blocks, duplicate of. Use constrained relations for dependencies; do not replace all existing relational tables with an unvalidated universal graph.

Acceptance: a task created from a resource is visible from both endpoints; deleting/restoring an endpoint has a consistent relation policy; references remain user-scoped.

Inspiration: [Obsidian backlinks](https://obsidian.md/help/plugins/backlinks) and [Linear issue relations](https://linear.app/docs/issue-relations).

### I05 — Dense table editing and stronger bulk operations

Effort: M–L.

Keep the existing rich resource cards and task board. Add a configurable table for administrative work: title, kind, project, tags, state, date, health. Support inline edits, range selection, and paste of multiple rows.

Extend existing bulk actions with previewed field changes, explicit selection scope (loaded rows versus all matches), partial-failure results and safe undo. Make zero-change operations cheap.

Acceptance: apply a tag to every matching item across pages, with an exact affected count and a clear way to exclude rows. Clipboard edits validate before committing.

### I06 — Project overview that identifies the next action

Effort: M.

Add a short goal, next action, blocked work, recent notes, useful resources and last meaningful activity. Offer direct-only versus descendant rollups for nested projects. Current Overview uses direct task progress for selected projects and sorts by project `updatedAt`; that is not necessarily activity inside the project.

Use distinct project states such as active, paused and complete. Avoid treating resource count or percentage of completed tasks as sufficient evidence of success.

Acceptance: adding or completing a task affects activity; rollup scope is visible; a project without tasks does not misleadingly appear 0% complete.

Inspiration: [Notion relation rollups](https://www.notion.com/en-gb/help/relations-and-rollups).

## New functionality worth building

### N01 — Maintenance center

Effort: M–L · High value for a growing library.

One actionable queue for duplicate candidates, metadata failures, broken links, untagged items, stale material, oversized files and projects with no next action. Each issue gets an explanation, last checked time, preview and fix/ignore action.

Reuse existing jobs and retries. Distinguish a failed embed from a dead page; distinguish 404/410 from transient errors and blocked automated access. Never automatically delete on the strength of a failed check.

Merge duplicates by choosing a canonical item and retaining notes, tags, attachments and all incoming links; preview conflicts first. Exact URL matching exists already, so focus on repair and consolidation rather than just another duplicate warning.

Inspiration: [Raindrop duplicates](https://help.raindrop.io/duplicates/) and [broken-link handling](https://help.raindrop.io/broken-links/).

### N02 — Reading/watch queue with progress and review dates

Effort: M–L.

Add queued, in progress, finished and reference states separately from review and favorites. Store reading position or playback position where the integration permits it. Let the user select a ten-minute item and resume where they stopped. Use existing metadata such as duration when available; label estimates.

Add optional review dates and a weekly shortlist of important neglected resources. Measure reuse and useful follow-up actions, not only saved-item counts. [Readwise's default views](https://docs.readwise.io/reader/guides/filtering/default-views) demonstrate progress-based resurfacing.

### N03 — Source-linked annotations

Effort: L.

Highlight text, pin a comment to a PDF page, save a video timestamp, and attach an image region. Create a task from an annotation while preserving its exact source. Begin with notes and PDFs, then supported media players; external embeds do not all expose the same capabilities.

Acceptance: clicking an annotation returns to its location; if the source changes, show the saved quote and an unresolved-location state rather than jumping to unrelated text.

### N04 — Task dependencies and time planning

Effort: M for dependencies; L for planning.

The current blocked status does not name a blocking task. Add blocked by / blocks, dependency-cycle checks, next-action filtering and completion notifications. Add estimated effort, then optional scheduled work blocks separate from due dates. A deadline is not necessarily an appointment.

Visualize dependencies on a project timeline once the dependency data exists. Keep manual scheduling as the baseline; suggested scheduling should preview conflicts. [Linear project dependencies](https://linear.app/docs/project-dependencies) provide a useful precedent.

### N05 — Templates and small automation rules

Effort: M for templates; L for reliable automation.

Templates: course, research project, content plan, meeting and software feature. Each creates useful initial sections, tasks and views without excessive setup.

Rules: when a GitHub URL is captured, suggest a project/tag; when a project is completed, offer to archive its finished tasks; when metadata repeatedly fails, add it to Maintenance.

Start with deterministic, opt-in rules. Require preview, run history, idempotency and loop protection before allowing broad mutations. AI suggestions can supplement rules later.

### N06 — Optional typed properties

Effort: L; defer until real repeated needs emerge.

Examples: papers have author/year; courses have progress; repositories have language; design references have category; people have an organization. Start with a small set of typed fields and templates rather than a complete user-defined database builder.

A useful prerequisite is separating content kind from source platform: a PDF file and an uploaded image are kinds, while YouTube and GitHub are origins with special rendering. Preserve existing adapters during any migration.

### N07 — A contextual relationship map

Effort: M after connection infrastructure.

Open a map centered on one project or resource, with one or two hops, labeled relation types and filters. Selecting a node opens its detail drawer. Include a list equivalent for keyboard and screen-reader users.

Useful question: which resources support these tasks, and which tasks have no supporting context? A global graph of everything should come later, only if users can make decisions from it.

### N08 — Better capture and interoperability

Effort: M–L.

Extend the existing bookmarklet, PWA share target and token capture with selection-aware browser capture: quote, page title, source URL, why saved, and an optional project. Add HTML bookmark and CSV import with a preview and duplicate policy. Build a durable retry queue for offline capture only after server idempotency is reliable.

### N09 — Retrieval-assisted suggestions

Effort: L; later phase.

Useful initial capabilities: suggest tags/projects with reasons, find related saved material, draft a summary with source links, or propose tasks from a note. Keep suggestions distinct from committed changes and show which source text supports them. Evaluate lexical search coverage first; add semantic retrieval only where measured retrieval failures justify it.

## Implementation order

1. Trust and findability: F01–F06, then F07–F10. Start export completeness alongside quick-note search/trash; full restore can be a separate larger milestone.
2. Everyday speed: saved views, shared filter state, quick-note promotion, and inbox/review separation.
3. Connections and maintenance: a reusable connection panel, maintenance center, project next actions, file reference lifecycle and activity history.
4. Deeper usefulness: annotations, reading progress, dependencies and templates.
5. Expansion based on use: custom properties, contextual graphs, offline capture and AI-assisted retrieval.

The best first feature bundle is saved views + note promotion + review queues. These reuse the existing app and improve daily work without requiring a platform rewrite.

## Architectural approach

- Keep Postgres, Drizzle, TanStack Query and the existing feature modules. No new search service or graph database is justified by this review alone.
- Introduce a shared, versioned filter representation before saved views, bulk-all-matches or automation rules.
- Define an entity capability registry for labels, routes, search, trash, export and supported actions. This reduces omissions when a new entity type is added; it need not become a universal entity table.
- Keep authoritative ownership checks in every DAL operation. New links, saved views and indexes must not bypass user scoping.
- Use server transactions and idempotency for conversions, merges and bulk changes. Integrate new mutations with the existing optimistic/sync system.
- Add document/file references before history and conversions spread attachments across entities.
- Use cursor pagination and summary DTOs; profile before adding more virtualization or caching.
- Add narrowly targeted integration tests for search pagination, conversion, multi-user isolation, export/restore and triage ordering. Existing unit and E2E suites are useful foundations, not evidence that these specific journeys pass.
- Update README/PLAN against actual capabilities: the README still describes projects/tasks/calendar as later phases, despite their implementation.

## Success measures to collect

Establish baselines before setting numeric targets: time from search to opening the intended item; capture-to-triage time; repeat filter setup frequency; oldest unresolved maintenance item; failed mutation/retry rate; percentage of exports successfully restored in a test account; resources later annotated, revisited or linked to completed work.

These measures should guide product choices. More entities, more saved links and more colorful graphs are not sufficient measures of usefulness.

## Review limitations

No application code was changed. No signed-in UI walkthrough, performance benchmark, concurrency test or regression suite was run for this review. Findings distinguish directly observed source behavior from risks needing reproduction. No existing graphify output or workspace-specific Canvas runtime was available in the inspected locations; the durable review is provided as Markdown instead.
