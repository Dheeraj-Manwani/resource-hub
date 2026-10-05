# Optimistic UI, loading feedback, sync status, and browser memory

Research date: 5 October 2026. Reviewed checkout: `c240406`.

The initial research was a source audit and implementation proposal. Implementation updates for Phases 1–5 appear in Section 7. The reported production memory reading is **301 MB in the browser's tab-hover popup while another tab was active**. No production heap snapshot, browser trace, or memory benchmark was collected, so this report does not claim to have identified a production memory leak or measured savings.

## Recommended decisions

1. Add the requested shared Zustand sync store, with one record per operation and derived status. Keep server entities in TanStack Query; Zustand should hold only sync metadata.
2. Show a compact status immediately above Trash in the sidebar footer. Include pending writes, upload workflows, and saves queued by autosave. Exclude ordinary reads, reminder polling, and metadata enrichment from the write indicator.
3. Repair concurrency, rollback, filter membership, and cache reconciliation before expanding optimistic UI.
4. Add optimism first to project edits, checklist add/delete/reorder, associations, reminder dismissal, and reversible bulk edits. Use pending placeholders for creation. Keep irreversible and server-generated outcomes behind honest pending states.
5. Improve loading and failure feedback locally. The sidebar indicator supplements the action being performed; it cannot replace a calendar loading state or a failed Save button.
6. Profile memory before choosing a target. The strongest source-backed opportunities are the nonvirtualized grid, full-content list payloads, unbounded loaded pages, and mutation rollback snapshots. A small sync store is unlikely to be the dominant memory cost if it stores no content.

## 1. What already works, and what needs repair

### Existing optimistic behavior

- [Task hooks][task-hooks] optimistically patch task fields, move tasks, remove deleted tasks from lists, and toggle/edit checklist items.
- [Resource hooks][resource-hooks] optimistically patch favorites, review status, text, tags, and note bodies; deletion removes resources from lists immediately.
- [Settings hooks][settings-hooks] update settings before the server responds.
- [Project hooks][project-hooks] optimistically change a moved project's parent, but not its full sibling order.
- [The task board][task-board] shows a local drag preview, and [the calendar][calendar-view] uses FullCalendar's immediate move/resize plus a revert callback. These are partial optimistic interactions already, even though the occurrence query cache is not patched.
- [The editor][note-editor] inserts a local image immediately during upload, then replaces its URL or removes it on failure.

Keep these fast interactions. Their principal weakness is consistency and recovery, rather than a lack of spinners.

### Priority correctness issues

**Whole-list rollback can undo another successful edit.** Task and resource updates save snapshots of every matching cached list and restore those snapshots on failure. Example: edit A starts; edit B succeeds; A fails and restores a snapshot from before B. This affects different entities sharing a list as well as repeated edits of one entity. An older successful response can also overwrite a newer optimistic edit because responses replace the entire entity.

**Some rollback surfaces are incomplete.** `useMoveTask` calls `upsertTaskInCache`, which updates lists and detail, but restores only lists on failure. Checklist edits update detail and lists but restore only detail. Task/resource updates can create a detail cache entry from list data; if no detail existed before the mutation, failure does not explicitly remove that newly created optimistic entry. See [task hooks][task-hooks] and [resource hooks][resource-hooks].

**Patching an object is not the same as maintaining a filtered list.** The upsert helpers replace existing rows but do not insert new rows, remove rows that no longer match a filter, or restore sort order. Unfavoriting a resource can leave it in a cached Favorites list. Completing a task can leave it in a filtered pending-task list. Normal task/resource PATCH success does not perform a general list reconciliation. Task `applyPatch` also omits fields such as `projectId` and `rrule`, despite the detail UI submitting those fields.

**Related views are not reconciled uniformly.** Task edits may affect calendar occurrences, smart-filter counts, project progress, Overview, and linked-resource counts. Deletion/Undo may affect Trash. Define affected query families per operation instead of assuming that updating the primary list is sufficient. [Trash hooks][trash-hooks] invalidate several broad families, while other mutations invalidate much narrower sets.

**Settings have a similar race.** The settings mutation does not cancel an in-flight settings read before optimistic patching. Rollback restores the entire previous settings object, and success replaces it with a full response. Concurrent changes to timezone and view preferences can overwrite each other locally.

**Autosave needs explicit ownership.** The editor debounces network-backed saves by 800 ms and attempts to flush on unmount. Its timer reference is not reset after the scheduled commit fires, so cleanup can attempt another commit even after the debounce already ran. Verify editor destruction/effect ordering rather than assuming this always happens. Quick Notes is different: its editor uses `debounceMs={0}` to update a local draft, with explicit Save and unsaved-change protection. Preserve that distinction. See [editor lifecycle][note-editor] and [Quick Note dialog][quick-note-dialog].

### Proposed consistency policy

- Introduce mutation keys and entity identifiers consistently.
- Keep an authoritative server value plus ordered pending patches, or use an equivalent entity-aware optimistic overlay. On response, acknowledge that operation and reapply newer pending patches. Roll back only the failed operation.
- Serialize conflicting writes per entity through a shared coordinator, including writes from different mounted hook instances. Coalesce unsent autosave body changes to the latest draft. Different entities can still save concurrently.
- TanStack Query mutation scopes can serialize execution, but scopes alone do not solve optimistic layering: the installed Query core runs `onMutate` before the scoped mutation function starts. A queued mutation can already have patched the cache. Test the coordinator with queued optimistic changes.
- Handle multi-entity bulk changes with entity-level ownership so they cannot clobber a concurrent single-row edit. Avoid snapshotting an entire library for a one-field change.
- Remove known filter mismatches immediately. For date/recurrence/server-dependent membership, keep a pending indication and reconcile affected active queries. Do not guess cursor-page insertion or server sort keys.
- Distinguish DB write success from a failed follow-up refresh. A failed read after a successful write must not roll back a committed write or produce “couldn't save.” Show “Saved; couldn't refresh this view” and offer a read retry.
- Audit endpoints for transaction boundaries before treating a successful response as acknowledgment of the complete logical operation. Multi-step uploads and metadata jobs have separate completion points.

TanStack supports both cache-based optimism and temporary UI rows based on pending mutation variables. Use cache/overlay updates when an existing entity is visible in multiple places; use a pending row when server-generated creation results are not yet known. [TanStack optimistic updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates).

## 2. Where additional optimistic UI fits

### First implementation group: predictable, reversible actions

**Project name, icon, color, and description.** [Project updates][project-hooks] currently wait for a response before updating cached data. Patch the project tree, detail, breadcrumbs, and relevant chips immediately, with operation-specific rollback. Creation can show a “Creating…” tree row. Server checks still govern uniqueness, ownership, and validity. Fully preserve sibling order during project moves; current optimism changes only the parent.

**Checklist addition, deletion, and reordering.** These currently update on success; only item edit/toggle is optimistic. [The checklist UI][task-checklist] clears the add input immediately without showing a temporary row, so a slow request feels as though input disappeared. Add a pending row with a client-only ID, preserve entered text on failure, remove deleted rows immediately with rollback, and reorder the displayed list before saving. Reconcile server IDs/sort keys before allowing operations that require them.

**Project/resource and task/resource associations.** [Project association hooks][project-hooks] and [task association hooks][task-hooks] wait for the server. Add/remove known chips immediately, update counts and scoped membership where determinable, and show “Adding…” only on the affected chip if slow. Reverse only that association on failure. Resource drops onto projects should visibly update the resource's membership instead of relying solely on the later success toast.

**Task archive and reversible bulk actions.** Optimistically apply status, priority, tags, favorite/review state, archive state, and soft deletion to the affected entities. Maintain pending selection state and handle partial results explicitly. [Bulk task actions][task-hooks] and [bulk resource actions][project-hooks] currently update after a response. Archive is currently a toggle endpoint: do not automatically retry an ambiguous request as if it were an idempotent “set archived=true” operation.

**Reminder dismissal.** Remove the dismissed occurrence from the bell immediately and restore that occurrence if the write fails. Add/remove reminders can use pending chips. Snooze is currently local state plus a timer; label it as a local snooze unless DB persistence is deliberately added. It should not imply a server write that does not exist. See [reminder hooks][reminder-hooks] and [reminders bell][reminders-bell].

**Tag rename/color.** Update known tag representations immediately. Reconcile all affected resource/task chips and tag queries. Merging/deleting a tag has wider consequences; use a confirmed operation with pending feedback initially. See [tag hooks][tag-hooks].

### Second group: creation and explicit saves

**Task, resource, and project creation.** Show a pending row/card carrying the submitted title or URL. Replace it with the server result, deduplicate, and keep a recoverable failed row/draft if creation fails. Disable actions requiring a real ID. Plain notes are easier than external links: links additionally need duplicate checks and metadata enrichment. A successful create acknowledgment means the record was saved, not that its metadata is ready.

**Quick Notes.** Keep explicit Save and Save & Exit behavior. Optimistically update the existing note card when Save is submitted, but close only once the intended save is acknowledged unless a durable draft/recovery mechanism has been implemented. Preserve dirty content on failure. Patch project-scoped caches as well as the unfiltered list; current [Quick Note hooks][quick-note-hooks] patch the unfiltered list after success and invalidate scoped lists.

**Task/resource note autosave.** Keep typing immediate. Show local “Unsaved changes” while the debounce is queued, “Saving…” during writes, “Saved” only when the latest revision is acknowledged, and “Couldn't save — Retry” on failure. New typing during an older save must not be marked saved by the older response.

### Operations that should retain explicit waiting

- Permanent deletion, Empty Trash, project subtree deletion, and broad tag merge: keep confirmation and pending controls until the outcome is known. Start with pessimistic execution rather than pretending irreversible completion.
- API token creation/revocation and calendar-feed secret generation: show pending state; display newly generated secrets only from a successful server response.
- File uploads and thumbnail replacement: show real transfer progress and server finalization. A local preview may be optimistic, but completion cannot be invented.
- Metadata extraction, README fetching, PDF/third-party embed loading: use local loading/fallback states. These are reads or enrichment jobs, not proof that the user's write remains unsaved.
- Recurring calendar edits: wait for the user's “this/following/all” choice. Optimistically patch one occurrence only when its identity/scope is unambiguous. Reconcile series edits rather than implementing a second recurrence engine in the client.

## 3. Global Zustand sync design

### Meaning and ownership

Recommended meaning: **“This tab has user changes queued for persistence, writes in progress, or reconciliation attached to those writes.”** A status should never mean “some HTTP request anywhere is running.”

The requested global Zustand state is useful for sharing sync feedback across the sidebar, drawers, editors, and uploads. TanStack Query already owns mutation lifecycle and server cache; retain that ownership. Zustand is a small view of operation status, plus manually tracked workflows, rather than another copy of resources/tasks/notes. Zustand is not currently listed in `package.json`; adding it belongs to implementation, not this research change.

### Store contract

Each operation needs a unique ID, source (`mutation`, `autosave`, `upload`, or manual workflow), entity key when applicable, short user-facing label, start time, and phase. Suggested phases: `queued`, `writing`, `reconciling`, `paused`, `failed`, and `unknown-outcome`.

Actions: begin/upsert an operation, update phase, acknowledge/finish one operation, record failure, dismiss a resolved failure, and reset on session change. Finishing an unknown or already-finished ID must be harmless. Repeated cache notifications must not increment a counter twice.

Derive active/paused/failure counts and `isSyncing` from the records. Never let callers directly set `isSyncing=false`. If A and B are active, completion of A must leave B visible.

Store only metadata. Do not retain note JSON, list snapshots, `File`, `Blob`, editor objects, secrets, request payloads, or retry closures in Zustand. Keep retry ownership in the mutation/draft workflow and store only the identifier needed to reach it. Remove completed records immediately; retain a small bounded set of actionable failures until resolved/dismissed.

### Integration strategy

1. Create one store per mounted application/session provider, initialized empty for server rendering and hydration. Keep it stable across client route navigation; reset it on logout/account change. Pass its vanilla store API to coordinators that run outside React. Avoid a server-wide mutable singleton. [Zustand Next.js setup](https://zustand.docs.pmnd.rs/learn/guides/nextjs).
2. Add a root bridge subscribing to `queryClient.getMutationCache()`, with explicit mutation metadata to opt user-persistence operations in. Key entries by mutation identity, mirror pending/paused/final states, and unsubscribe on provider teardown. Seed from current cache entries so a late bridge mount misses nothing. This survives a drawer closing while its mutation is running. [MutationCache subscription](https://tanstack.com/query/latest/docs/framework/react/reference/classes/MutationCache).
3. Give each persistence mutation a key, entity identity, and sync label. The bridge should fail visibly in development for an unclassified write, rather than quietly omitting new mutation hooks.
4. Track direct Undo API calls, storage PUTs, thumbnail uploads, and Quick Note image uploads through a reusable workflow tracker with `try/finally`. These currently bypass the mutation cache. A parent workflow should count once, even if it performs several requests. Do not instrument both that workflow and all its inner writes as separate sidebar operations.
5. Hand queued autosave status to the mutation record without an idle gap or duplicate count. Explicitly edited but unsubmitted Quick Note drafts show a local unsaved label; they do not count as active sync merely because text exists locally.
6. Keep an operation pending through required cache reconciliation. Return/await intended invalidation promises consistently; current hooks mix returned promises and fire-and-forget invalidation. Do not wait for unrelated background reads. If the DB write succeeded and reconciliation failed, expose a refresh problem instead of a save failure.

The existing Query implementation awaits lifecycle callbacks before final success/error dispatch. It also defaults mutations to no retries. These details were checked in the installed Query core `5.104.0`; preserve them deliberately rather than adding automatic retries to every write.

### Sidebar placement and behavior

Insert `SyncStatus` as the first child of the bottom footer in [SidebarContent][sidebar], immediately above the Trash link. This component is shared by the desktop sidebar and mobile navigation sheet. On mobile, add a small top-bar equivalent when navigation is closed so a background save is still visible.

- Queued autosave: “Changes pending…” or a local “Unsaved changes” label before the network request starts.
- Active writes: small spinner and “Syncing…”; optionally “Syncing 3 changes.” Upload byte progress stays in the upload UI.
- Slow operation: after a proposed 10-second threshold, “Still syncing…” with a details affordance. This is a UX threshold to validate, not evidence of failure.
- Offline/paused: “Offline — changes pending.” Do not display an endlessly spinning active-network indicator for a paused operation.
- Failure: “Couldn't sync 1 change” with details and a safe retry path. If other operations are active, communicate both pending work and failure. One later success must not erase another unresolved error.
- Ambiguous network outcome: “Couldn't confirm save” and check server state before replaying a creation or toggle operation.
- Successful completion: optionally show “Saved” for about two seconds, then leave the reserved status area quiet. Avoid claiming “All saved” while the latest autosave revision or an unresolved failure remains.

Update operation accounting immediately, but delay the visual spinner by roughly 200 ms to avoid flashes on very fast saves. Reserve a small stable footer area to avoid moving Trash whenever sync starts. Respect reduced-motion preferences. Use a polite status live region and accessible labels; don't repeatedly announce every poll, keystroke, or operation count. [W3C status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

### Offline/retry boundaries

Phase one should not claim durable offline synchronization. In-memory Query/Zustand state does not survive tab discard or reload. Preserve editor drafts and warn about unsaved content where appropriate. Do not persist a spinner/counter to storage. A later offline feature requires a durable outbox, draft persistence, idempotency keys, ordering/conflict rules, and account isolation.

Provide retries for known safe/idempotent operations. A timeout or disconnected response does not prove the server failed to commit. Retrying POST creation, uploads, toggle archive, or deletion workflows blindly can create duplicate or unintended outcomes. Introduce client request IDs/server deduplication where replay is required.

## 4. Loading states and action feedback

Keep existing list/detail skeletons, load-more spinners, upload rows, thumbnail upload feedback, dynamic editor skeletons, and Quick Note Save text. Improve these gaps:

1. **Calendar navigation and filters:** [CalendarView][calendar-view] reads only `data`, defaulting to an empty occurrence array. Expose initial loading, background fetching, error, and retry state. Keep already loaded content visible only when it belongs to the displayed range; do not show last month's dates as current results. Show a subtle header loader for a range refresh. [CalendarSidePanel][calendar-side-panel] also defaults unresolved data to empty rows and “Nothing here”; give its two sections independent loading/error states.
2. **Calendar completion/moves:** optimistic occurrence completion should check immediately and remain marked pending until acknowledged. Keep drag/resize preview and robust revert/error handling. Scope selection cancellation must revert; scoped writes need per-event feedback rather than a whole-calendar blocking overlay.
3. **Search and command palette:** [CommandPalette][command-palette] can show “Nothing found” during a request. [SearchView][search-view] suppresses its empty state while fetching but supplies no visible loading branch. Show a small search-input spinner and “Searching…” only while the relevant query is pending. Distinguish debounce, loading, genuine zero results, and errors. Debounce and query cancellation already exist; preserve them.
4. **Destructive confirmation:** [ConfirmDialog][confirm-dialog] has no pending/error contract and closes immediately after calling `onConfirm`. Add pending text/spinner, duplicate-submit protection, and inline error. Close on success; keep the dialog open on failure. Apply to permanent deletion, Empty Trash, tag deletion/merge, and comparable confirmed operations. Do not block unrelated controls globally.
5. **Checklist:** show pending/failed rows and preserve failed addition text. Disable duplicate destructive submissions for the same item, while allowing edits to unrelated items.
6. **Drawers and associations:** duplicate/archive/link/unlink/refresh actions need per-entity feedback or optimism. For an optimistic toggle, do not replace its value with a spinner; use a small pending marker or global sync status. For an operation that must wait, show a spinner on its own button.
7. **Query failures:** Tasks, Tags, Trash, Quick Notes, and token lists have paths that default absent data to empty without a dedicated error branch. Audit each query before showing “No tasks,” “No tokens,” or similar. Existing cached data can remain visible with a retry banner when a background refresh fails.
8. **Preview and lightbox chunk loading:** these are already dynamically imported, but the preview host uses a null fallback. Show a lightweight loading surface immediately on open so the first slow chunk load is not an apparently ignored click. Do not eagerly mount the heavy viewer merely to display its loader.
9. **Editor attachments:** local previews currently do not give an explicit per-image upload state. Mark pending/failed images, allow retry/removal, and prevent a save from persisting a transient `blob:` URL. Quick Note explicit Save should wait for pending attachments or save a deliberately recoverable draft. Resource/task editor autosave needs the same URL-safety policy when image upload is enabled.
10. **Media/PDF:** YouTube/Pinterest lack a complete user-visible loading/timeout path; X has a spinner but no explicit deadline for a script/widget that never settles. PDF loading ends on iframe load, which is not a guarantee of successful document rendering. Provide bounded wait, retry, and Open original/download fallbacks where technically observable. Keep these loaders out of global write sync.

Use skeletons for an unknown layout, small spinners for short indeterminate actions, percentage bars for measurable uploads, and durable inline errors for work that requires recovery. Avoid a toast for every autosave and avoid displaying several full-page spinners for routine cached refreshes.

## 5. Interpreting the reported 301 MB

The tab-hover number is a tab memory indicator, not a direct live-JS-heap measurement. The browser has a separate JavaScript-memory view for diagnosing reachable objects. Chrome distinguishes overall memory footprint from JS memory, and does not define one universally acceptable page-memory threshold. Consequently, **301 MB alone is neither proof of a leak nor proof that the app is sufficiently efficient**. It deserves investigation for an idle productivity app, especially on lower-memory devices. [Chrome memory diagnostics](https://developer.chrome.com/docs/devtools/memory-problems/), [Chrome performance settings](https://support.google.com/chrome/answer/12929150).

Switching to another tab does not necessarily unmount the app, discard its caches, or unload its media. Whether the browser actually deactivates a tab depends on its performance settings and activity. Use application visibility policies as an optimization, while keeping browser tab deactivation as a separate behavior.

### Source-backed opportunities, ordered by likely usefulness

**A. Grid DOM grows with loaded data — high confidence.** [Masonry][masonry] renders every positioned item, attaches measurement observers, and retains measured heights. It has no visible-window virtualization. [ResourceList][resource-list] already uses `useWindowVirtualizer` with overscan 8, so grid/list comparison is an especially useful experiment. Virtualize masonry while preserving measured spacing, scroll position, keyboard focus, drag behavior, and active playback. Prune removed-item height entries. CSS visibility tricks alone would not remove retained DOM/data.

**B. Full-content list caches — high confidence.** Resource list DTOs include `bodyJson` and note text. Task list DTOs include description JSON/text, checklist, resources, and reminders. Quick Notes fetches all rows with full content and no list pagination. These are visible in [resource DTO mapping][resource-dal], [task DTO mapping][task-dal], and [Quick Note listing][quick-note-dal]. Introduce summary list DTOs and lazy full-detail reads. Preserve detail loading placeholders, and fetch Quick Note detail when opening its editor. This is an API/client contract change, not just a `select` optimization: selecting fewer fields after downloading the full response does not eliminate the underlying cache payload.

**C. Loaded pages and cache variants — high confidence, magnitude unmeasured.** Resource/task infinite queries do not configure `maxPages`; scrolling accumulates pages in active queries. Different filters/months/searches create distinct cache entries. Providers sets a 30-second stale time but no custom garbage-collection policy. Inactive queries normally expire after five minutes; active lists are not freed merely because the tab is hidden. [Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults).

Start with targeted inactive cache budgets and shorter retention for large details/search results, not blanket cache clearing. Then consider bounded loaded pages. The current forward-only pagination must gain a recoverable previous-page strategy or an explicit pagination UX before arbitrary page eviction; otherwise old cards disappear and upward scrolling breaks. TanStack documents `maxPages` with directional cursor support and notes that infinite-query refetches can traverse retained pages. [Infinite-query limits](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries).

**D. Rollback snapshots retained by mutation entries — confirmed retention mechanism, size unmeasured.** Every task/resource edit can keep references to all cached list snapshots through mutation context, including old note bodies. These snapshots are references rather than deep copies, but they can keep previous versions reachable. The installed Query core defaults unused mutation entries to five-minute GC; observed/pending entries can remain longer. Reduce rollback context to affected entities/patches, consider a shorter completed-mutation retention policy after testing pending-row/Undo needs, and inspect heap retainers during autosave stress. Never solve this by dropping an in-flight rollback context.

**E. Embeds and decoded images — plausible substantial contributors.** YouTube has a poster facade and unmounts far-off-screen frames, but uses a generous 1200 px margin. Instagram has viewport gating and timeouts. X's grid card is click-to-load, but after activation its widget has no equivalent viewport teardown; cancellation prevents some state updates without proving the external SDK releases everything. A paused YouTube iframe can remain mounted. Profile active frame count, hidden-tab activity, and repeated open/close cycles. Prefer saved snapshots in grids and tear down nonessential inactive embeds while preserving user playback intent. See [YouTube][youtube-player], [Instagram][instagram-embed], [X][x-embed], and [media controller][media-controller].

Images already use `loading="lazy"` and async decoding in [ResourceImage][resource-image], but card thumbnails can fall back to original images. Smaller display size is not proof of smaller decoded resources. Generate genuine bounded thumbnails/responsive variants through the existing storage/image pipeline where possible; measure image-heavy pages separately. Do not assume authenticated redirect URLs can simply be sent through Next Image without validating that serving model.

**F. Always-imported shell features — confirmed import pattern, impact unmeasured.** [AppShell][app-shell] statically imports dialogs, command palette, tour, and detail drawer. Tiptap editors, lightbox, and resource preview already have dynamic imports. Profile initial chunks; defer additional rarely used drawer/modal implementations if material. Preserve lightweight shortcut registration and an immediate chunk-loading surface. Code splitting mainly helps initial loading and allocation; imported code may remain in the browser for the session, so it is not a cure for ongoing object retention. See the [installed Next.js lazy-loading guide][next-lazy-guide].

**G. Uploads and small lifecycle risks — targeted improvements.** [Uploads][uploads] starts every selected file concurrently with `Promise.all`, creating a possible peak-memory/concurrency problem during large batches. Use a small concurrency limit, transfer timeouts/cancellation, and release completed workflow references. The editor already revokes object URLs in `finally`; media registries, observers, resize handlers, and FullCalendar's external draggable also have cleanup. Do not label these as proven leaks. Still test never-settling uploads, X widgets, snooze timers, editor save timers, and repeated modal teardown for retained state.

### Background polling policy

Resource queries poll every three seconds while **any cached page** contains pending metadata; the code comment says visible resource, but the predicate is not restricted to the viewport. List and detail polling can coexist. Reminders poll every minute. Query defaults normally avoid interval refetching in the background unless enabled; confirm actual behavior on the deployed build rather than claiming hidden tabs currently poll continuously.

Consolidate metadata progress checks or fetch small pending-status batches instead of refetching entire accumulated lists. Stop/back off permanently stuck pending jobs and expose a recoverable metadata error. On visibility restoration, refresh relevant data once and resume useful polling. Never stop an already queued user save just because the tab becomes hidden. Reminder delivery needs a product decision: a frozen/discarded tab cannot provide reliable background reminders without a server/push mechanism.

## 6. Production profiling procedure

Use production, a fixed account/dataset, recorded browser/version and device RAM, and an extension-free profile. Record Memory Saver configuration and whether media is playing. Separate the normal tab-hover measurement from the diagnostic DevTools session, since opening DevTools changes the environment. No destructive operations on real data are needed for memory profiling.

1. Start on Overview with no drawers or embeds, settle for two minutes, and record tab footprint, live JS memory, DOM count, frame count, query-cache entries/pages, and network activity.
2. Compare the same Library dataset in grid versus virtualized list. Scroll fixed amounts to load 1, 5, and 10 pages. Record each result rather than labeling all of them “idle.”
3. Open/close resource preview, task drawer, Quick Note editor, image lightbox, and PDF view 20 times each. Test third-party embeds separately. Compare snapshots and retained objects after repeated cycles and after garbage collection in a diagnostic run. [Chrome heap snapshots](https://developer.chrome.com/docs/devtools/memory-problems/heap-snapshots?hl=en).
4. Perform a controlled autosave/edit scenario on disposable test data. Inspect mutation contexts and old document versions; wait beyond the inactive-cache GC interval, then inspect again. Verify whether the last observed mutation remains attached to a mounted hook.
5. Leave the tab hidden for 10–15 minutes, then return. Record memory trend, media/CPU activity, network traffic, state preservation, and stale-query recovery. Compare with and without an activated embed.
6. Compare repeated runs with identical data. A footprint plateau with little hidden-tab activity differs from steadily increasing reachable objects or detached DOM. Trace retainers before naming a leak. Account for intentional cache warmup and cached images.

Do not promise “301 MB to 100 MB.” Set budgets after baseline measurements on representative devices. A reasonable acceptance direction is bounded mounted-card count, bounded intentional cache growth, near-zero idle hidden-tab CPU/network except approved background work, and no repeated-cycle retained-object growth after expected cache cleanup. Exact MB limits require evidence.

## 7. Implementation sequence

### Phase 0 — baseline and contracts

- Capture the production profile above and slow-network recordings of the core workflows.
- Inventory persistence operations, including direct Undo and upload API calls. Define operation phases, mutation metadata, entity keys, affected query families, and acknowledgment semantics.
- Agree that ordinary reads/enrichment do not display as unsaved writes. Keep explicit Quick Note Save behavior.
- Deliverable: baseline measurements and a checklist of cache/UX invariants. Effort: small to medium; production access and reproducible data are prerequisites.

### Phase 1 — sync infrastructure and visible recovery

**Implemented on October 5, 2026.** Zustand now stores transient operation metadata in a provider-owned store. All existing persistence mutations declare sync metadata; direct Undo actions, capture, resource/thumbnail uploads, and quick-note image uploads use manual tracking. Debounced task/resource note edits register queued work and hand it over to the mutation bridge; local-only Quick Note editor updates do not register database writes.

The reserved sidebar status sits directly above Trash; mobile users also see status beneath the top bar and in the navigation sheet. It supports pending, offline, slow, saved, failed, and uncertain outcomes, with a polite live region, a delayed spinner, reduced-motion support, and a details popover. Retry is available for supported explicit assignments until a newer operation touches the same entity. Creation, duplication, recurrence changes, uploads, destructive actions, and association/move workflows require review rather than blind replay. A refresh failure after a successful mutation offers a read retry. Dismiss clears the notification metadata; it does not undo the operation or recover a draft.

The bridge observes relevant invalidation refetches initiated while a mutation is reconciling, including callbacks that do not return their promises. It does not issue additional reads to drive the indicator or count ordinary background queries. The shared query-family mapping conservatively associates overlapping mutations with relevant refreshes; Phase 2 below adds per-entity coordination and cache reconciliation.

Failure metadata is capped at 20 entries. Payload-bearing retry closures stay outside Zustand and are released on dismissal, eviction, mutation garbage collection, session reset, or provider teardown. Metadata resets on logout/account change, and late operation completions cannot resurrect old sync entries. Online/offline listeners and subscriptions are cleaned up; React Strict Mode's immediate reconnect preserves pending work. Pending requests are not persisted across reloads, and resetting the indicator does not cancel a write already sent to the server.

**Integration for future UI:** import `useSyncStore` and `useSyncController` from `components/sync-provider.tsx`. Select a stable primitive for a global busy indicator, for example:

```tsx
const isSyncing = useSyncStore((state) =>
  Object.values(state.operations).some(isActiveOperation)
)
```

Import `isActiveOperation` from `lib/sync/store.ts`. Zustand holds metadata, not application entities or request bodies. Register new TanStack mutations using the typed `syncMutation(...)` catalog in `lib/sync/mutations.ts`, specifying a clear label, entity family, and whether replay is safe. Extend the controller's query-family map when adding a new domain. A direct workflow should use `sync.track({ label, source, entityKeys, href }, async (saved) => { ... })`: call `saved()` only after the server confirms persistence, then await required cache reconciliation. `track` finishes or records failure and rethrows for local error handling. Nested upload steps belong to one tracked workflow, rather than separate start/PUT/complete counters. Do not use this global busy selector to disable unrelated actions throughout the app.

**Verification:** 119 unit tests pass, including 15 sync lifecycle tests; TypeScript passes. Isolated browser checks mount the actual status component at desktop/mobile sizes and exercise concurrent operations, details, review links, retry, and the Saved timeout. All 10 signed-out smoke checks pass on desktop/mobile; lint has no errors and three existing warnings, and the production build passes. A separate browser check mounts the actual note editor and verifies queued debounce, a single timer save, a pending save on close, and no duplicate flush. Authenticated end-to-end workflows and real offline uploads still need verification against a signed-in test environment. Production memory profiling and the 301 MB investigation remain Phase 5; this implementation does not establish a memory reduction.

- Add Zustand, a stable provider-owned store, the mutation-cache bridge, manual workflow tracking, and queued-autosave handoff.
- Add sidebar status above Trash and mobile visibility. Add actionable failure details and safe retries without persisting transient operations.
- Cover every existing write before adding new optimism. Handle concurrent operations, pause/resume, login/session reset, direct Undo, nested upload workflows, and provider unmount.
- Deliverable: trustworthy sync status even with today's mix of optimistic and pessimistic actions. Effort: medium.

### Phase 2 — repair existing optimistic behavior

**Implemented on October 5, 2026.** Task/resource updates and moves, checklist edits, project reparenting, settings, and optimistic deletion now use entity-scoped patch journals. A failed mutation removes its own layer; it cannot restore an entire stale list over another entity's successful change. Server acknowledgments and authoritative reads rebase remaining patches. Overlapping writes to the same entity are serialized, while unrelated entities can progress independently; moves reserve their ordering family. Session reset releases queued reservations and prevents late callbacks from writing into the next account's cache.

List reconciliation updates known filter membership and loaded ordering, handles task project/recurrence fields, and reconciles related detail, overview, project, calendar, tag, reminder, and search queries. Complete loaded ranges can accept newly matching rows; incomplete cursor ranges and server-timezone-dependent smart-date filters defer uncertain membership to authoritative reads. Server cursors remain authoritative: optimistic reordering does not manufacture new cursor boundaries. Project breadcrumbs retain other pending changes during rollback.

Task/resource note autosave keeps the newest draft revision outside Zustand, acknowledges only the saved revision, and flushes pending edits to the correct entity when switching or closing a drawer. Failed drafts survive editor unmount within the current session and offer **Retry save** and **Discard draft**. A successful content save clears earlier failures for that draft. Payloads are released after acknowledgment, discard, session reset, or provider teardown; failed drafts are not silently evicted. Generic global retries cannot replay an older note body over newer typing. Draft recovery remains in memory and does not survive a page reload.

**Verification:** 141 unit tests pass, including 22 optimistic/concurrency/draft tests. TypeScript passes. Isolated Chromium checks using the actual editor and hooks verify failure recovery after close/reopen, retry, newer typing during acknowledgment, and flushing the previous entity on drawer switches. The Phase 3 validation below covers the combined final implementation. These changes reduce rollback-context retention structurally; no production memory reduction has been measured.


- Implement entity-aware rollback/rebasing and per-entity write coordination. Fix missing detail/list rollback surfaces, filter membership, task project/recurrence patch handling, sort reconciliation, and related-view invalidation.
- Repair editor timer accounting and latest-draft acknowledgment. Preserve failed drafts; separate successful write from failed refresh.
- Reduce full-list rollback contexts at the same time, addressing both correctness and memory retention.
- Deliverable: safe optimistic updates under concurrency and failures. Effort: medium to large; this is the foundation for expansion.

### Phase 3 — loading and error-state pass

**Implemented on October 5, 2026.** Shared `LoadingState` and `QueryFeedback` components provide accessible progress, separate initial-load errors from failed refreshes, and offer disabled-while-fetching Retry controls. Cached content stays visible on failed refreshes in resource/task lists, detail drawers, previews, overview, projects, notes, tags, Trash, search, and tokens. Network failures in drawers no longer claim that the record was deleted; task/resource detail 404s retain their actual not-found treatment.

Calendar queries wait for FullCalendar's visible range before fetching. Calendar and each sidebar list communicate loading/error/refresh state independently; sidebar lists also support pagination. Calendar occurrence requests display progress and temporarily disable conflicting interactions. Search no longer carries results from another query forward as placeholder data. The command palette hides previous-query results during debounce, communicates search progress/failure, and shows an empty message only after a successful empty result.

Permanent deletion, empty Trash, quick-note deletion, and project deletion await server completion. Pending dialogs block duplicate confirmations and dismissal; errors remain in the dialog for retry. Metadata refresh, task duplication/archive/deletion, restore, tag actions, checklist addition/deletion, and linking actions show local waiting feedback. Checklist addition retains its input on failure. Resource linking keeps pending selections stable; linking multiple quick notes waits for every result, keeps only failed selections, and retries those without relinking successful notes.

Resource preview and image-viewer chunks retain lazy loading and now have closable loading surfaces and error boundaries with an explicit page-reload recovery action. README failures offer Retry while preserving cached content. Full image previews offer loading/error feedback and Retry image. PDF/audio/video previews show loading, provide retry on detectable failures or unusually slow loading, and always retain open/download escape routes. An iframe load event cannot prove that a browser PDF viewer successfully rendered the document; cross-origin/native viewer failures remain a browser limitation.

**Verification:** Combined implementation passes TypeScript, the production build, 141 unit tests, and all 10 signed-out desktop/mobile smoke checks. Lint has no errors and three pre-existing warnings. Additional isolated Chromium checks render actual components with the generated app CSS and exercise cached-query failure/retry, destructive pending/failure/success, project deletion guards, closable viewer loading/error fallbacks, and a failed image followed by a successful retry. A separate Chromium check mounts the real quick-note hooks/provider and verifies partial bulk-link failure, retained selection, retry of only failed notes, and close after success. These checks use controlled responses and do not establish authenticated production behavior; signed-in full-calendar/search workflows, real attachment failures, and offline testing remain validation follow-ups. Phase 4 completion is documented below; Phase 5 production memory profiling remains pending.


- Add calendar/search loading, true empty versus failed-query states, per-action waiting feedback, pending destructive dialogs, chunk-loading surfaces, and attachment/media recovery.
- Reuse a small set of accessible loading/status components. Retain cached content during relevant refreshes and avoid whole-app blocking overlays.
- Deliverable: slow requests always communicate progress or a recoverable problem. Effort: medium; can proceed independently of most new optimistic features.

### Phase 4 — expand optimistic UX

**Status: implemented (2026-10-05).**

Predictable edits now use per-entity optimistic layers for project fields, task archival, checklist creation/deletion/reordering, task/resource and project/resource associations, tag names/colors, reminder removal/dismissal, and reversible task/resource bulk actions. Count-only acknowledgments commit only the matching layer; failures remove only their own changes, preserving newer edits and unrelated fetched rows. Linked chips use known cached IDs, and project/tag metadata is refreshed across cached cards and details without copying note documents or rewriting unchanged data. Aggregate counts and uncertain membership reconcile from the server.

Creation surfaces now show read-only pending rows for tasks, resources, projects, and Quick Notes in views where membership can be determined. Pending checklist rows also disable actions until their real IDs arrive. Server DTOs replace pending presentation before the authoritative refresh; temporary IDs are never sent as actionable entity IDs. Creation controls prevent duplicate submission and accidental close, preserve newer typing, and retain invalid bulk-link lines for correction. Unknown tag IDs and known rename collisions that can merge tags remain server-confirmed.

Quick Note cards preview explicit Save optimistically, recover their previous values on failure, and retain the editor draft for retry. A successful acknowledgment closes the dialog only if the current draft matches the submitted revision; typing during a pending save stays open. This remains explicit save, with draft recovery in the current session rather than a durable offline outbox.

Calendar optimism is limited to known non-recurring tasks: predictable title/status/priority/project/date changes update loaded occurrences and applicable task views, with rollback and server reconciliation. Recurring masters, detached exceptions, following-series splits, and unknown recurrence outcomes remain server-confirmed. Uploads, generated secrets, permanent deletion, and other irreversible actions keep their existing pending feedback.

**Verification:** 157 unit tests pass, including 16 new Phase 4 cases covering concurrent layer settlement, bulk rollback, associations, reference consistency, exact reminder occurrences, checklist ordering, note recovery, calendar membership, and recurring range boundaries. TypeScript passes. Isolated Chromium checks mount the actual hooks/provider, checklist, creation UI, and Tiptap editor against controlled responses: overlapping archive/title writes, project-chip and bulk rollback, tag edits, reminder recovery, ordinary calendar failure, creation ID handoff, pending checklist controls, and note preview/retry/newer-typing retention all pass. The production build and all 10 signed-out desktop/mobile smoke checks pass. Lint has no errors and one pre-existing hook-dependency warning in the Quick Note dialog. These checks do not establish authenticated production behavior or a memory reduction; signed-in integration testing and Phase 5 profiling remain follow-ups.

- First: project fields, checklist operations, association chips, reminder dismissal, tag color/name, and reversible bulk/archival edits.
- Next: pending creation rows and explicit-save card previews with draft recovery and ID reconciliation.
- Last: carefully scoped calendar occurrence optimism. Keep server-generated secrets, uploads, irreversible operations, and complex recurrence outcomes honest.
- Deliverable: immediate response for predictable actions without hidden data loss. Effort: medium to large, preferably split by feature.

### Phase 5 — measured memory reductions

**Status: first measured memory pass implemented (2026-10-05). Production acceptance and the larger API migrations remain open.**

The resource grid now uses measured, window-virtualized masonry. It mounts visible cards plus overscan and retains cards that own keyboard focus, a drag, a portalled menu, or active playback. Keyboard traversal can mount the next unseen card. Removed keys are pruned from measurements and retention state. Paused offscreen YouTube frames return to their posters, while an active player stays mounted. X widget cleanup removes late injected DOM; third-party script loading has a 15-second timeout and releases failed loader references. A checkbox bubbling bug discovered in the browser checks was fixed so selecting a card toggles once.

Metadata progress now has one provider-level poller instead of refetching every loaded list page. A new authenticated, ownership-scoped endpoint returns only IDs and metadata statuses for at most 50 resources per request. Two workers bound batch/completion reads. Active list/detail observers determine which cached records need progress checks; inactive filter caches are excluded. Progress starts at 3-second intervals, backs off to 15 seconds after a minute and 60 seconds after two minutes, and suppresses interval reads while unfocused. New jobs or explicit resource invalidation reset the backoff. Completed jobs fetch their full DTO once, then reconcile cached views. Related writes pause polling and synchronously cancel older reads, preserving newer optimistic edits. Background enrichment stays outside the write indicator.

Inactive-cache budgets now release search variants after 30 seconds, task/resource detail and README/calendar data after 60 seconds, and task/resource lists plus Quick Notes after 120 seconds. Unobserved completed mutations expire after 120 seconds. Observed views and pending mutations are preserved; failed editor drafts remain owned by the draft registry. Generic mutation retry payloads can expire with their mutation entry, leaving Review/reopen available. No forward-loaded pages are silently evicted.

File and thumbnail uploads share a three-worker transfer queue across overlapping batches. Queued rows show their status; completed upload rows retain small progress metadata rather than a duplicate resource DTO. Independent file creations use independent reservations, while thumbnail writes still coordinate against their resource. Signing/finalization requests have 30/45-second timeouts and storage PUTs have a 180-second timeout. Queued work and later finalization stop after an account change; a timeout/error frees its slot. Task/resource drawer implementations also load on demand with accessible loading and closable error feedback.

**Measured baseline and results:** Reproducible production-React component profiles are saved in `docs/performance/phase5-before.json` and `phase5-after.json`. Both use the same current card/list components and fixed 500-record dataset, including variable-length text, with external images/frames and real database access excluded. The before run substitutes only the original masonry implementation from `c240406`; the after run uses the new implementation. Chromium 153.0.8010.12, a 1440×900 viewport, three fresh-page samples per 50/250/500 displayed records, and forced GC before each sample isolate mounted-component retention. All 500 fixture DTOs remain reachable even in smaller samples, so this is not a cache-payload benchmark. Median grid heap with 500 displayed records fell from **55.35 MiB to 7.61 MiB** (86.3% in this fixture). Mounted cards fell from 500 to 27, DOM nodes from 22,018 to 1,206, and listeners from 2,660 to 303. At 50/250 records, grid medians were 9.71/30.28 MiB before and 7.48/7.58 MiB after. The existing virtualized list stayed around 6.37 MiB with 21 mounted rows. After 20 scroll cycles, DOM/listener counts remained 1,207/316; post-GC heap changed from 9.20 to 9.34 MiB. This supports bounded mounted-component retention in the fixture; it does not establish zero growth in a real media/editor session.

Browser checks cover keyboard continuation/focus retention, 20 top/bottom scroll cycles, selection through unmount/remount, an actual dnd-kit drag/drop, mobile column resizing, retained playback through menu close, paused-frame teardown, compact metadata polling, simulated focus suppression, deduplicated completion reads, and cancelling a late completion read before a newer edit. Third-party playback is represented by a controlled frame and YouTube message events, not an external-video memory profile. Unit checks validate inactive-cache expiry, preservation of pending saves, worker limits, timeout recovery, and cancellation across account changes.

**Verification:** TypeScript and the production build pass; all 164 unit tests and 10 signed-out desktop/mobile smoke checks pass, including authentication on the new metadata-status endpoint. Both paired profiles and all eight browser behavior scenarios pass. Lint has no errors and one existing Quick Note hook-dependency warning. Measurement boundaries are in `docs/performance/README.md`. The temporary profiling scripts were subsequently removed at the user's request; the JSON captures remain historical evidence. Real authenticated Playwright CRUD coverage and run commands are documented in `tests/e2e/README.md`.

**Remaining Phase 5 work:** The supplied production URL is `https://resource-hub-henna.vercel.app/`, with an authenticated session in Brave. Brave is not exposed by the connected browser inventory, so that session's heap, decoded images, third-party frames, tab footprint, and 10–15-minute background trend could not be measured. The local result cannot be subtracted from the reported 301 MB tab-hover reading or establish a production leak fix. [Chrome distinguishes OS footprint from JavaScript heap measurements](https://developer.chrome.com/docs/devtools/memory-problems).

Next, collect that signed-in production profile and implement summary/detail API contracts plus Quick Note cursor pagination as a separate migration. Resource cards currently need full-note Copy, task actions/checklists use full DTOs, and Quick Note editing/conversion/linking consume full bodies; removing fields without a lazy detail-read contract risks overwriting content or copying a truncated note. Introduce explicit summary types and full-detail loading before trimming payloads, then verify autosave rollback, drafts, creation handoff, associations and conversion. Active forward-only resource/task lists also still retain loaded pages: a previous-page/recoverable navigation contract must precede `maxPages`. Genuine thumbnail variants, additional shell dialog/tour splitting, authenticated route scroll restoration, production editor/viewer cycles, real uploads, and external-media profiling remain follow-ups. These are deliberate boundaries of this first measured pass, not claims that every Phase 5 candidate is complete.

- Use baseline evidence to order grid virtualization, summary/detail DTO separation, Quick Note pagination, cache budgets/page strategy, narrower metadata polling, embed teardown, bounded upload concurrency, and shell lazy loading.
- Re-profile after each independently meaningful change. Recheck scroll restoration, selection, drag/drop, note drafts, playback, and offline/save feedback.
- Deliverable: before/after production profiles and documented budgets. Effort: medium to large; masonry and API DTO changes deserve separate review.

### Optional later phase — durable offline writes

Only after the above: persistent drafts/outbox, server deduplication, conflict/version handling, and cross-tab coordination. The initial sync store is per tab and is not a claim that all devices or tabs have synchronized.

## 8. Acceptance scenarios

- Two saves overlap; one succeeds and one fails. The successful value remains, the failed edit is recoverable, and sync status stays accurate.
- Rapid successive edits produce out-of-order responses. The newest intent stays visible and is eventually persisted. Repeat with bulk edits and a single-row edit touching the same entity.
- A drawer closes during autosave, or navigation changes during a write. Tracking remains alive; flushing does not submit a duplicate unchanged revision.
- Favorite/review/status/project/date changes update applicable filtered lists, counts, progress, and calendar after reconciliation. Undo is tracked and restores relevant views.
- A server write succeeds but the refresh fails. The UI reports a refresh issue without falsely undoing the write. Ambiguous creation results are checked before retry.
- Slow/offline/failed Save preserves draft content. Upload failures preserve retry/removal options and never save `blob:` URLs. Reload does not claim durable pending writes unless the outbox phase exists.
- Search/calendar/query failures do not appear as genuine empty data. Permanent deletion waits visibly, prevents duplicate confirmation, and retains its dialog error on failure.
- Sidebar status survives concurrent writes, avoids fast-request flicker, communicates paused/failure state, and is accessible on desktop and mobile.
- Memory profiles distinguish grid/list, caches, images, and embeds. Scrolling or repeated editor/viewer cycles do not cause unexplained, unbounded retained growth. Cached read performance and UX remain acceptable.

## Evidence links

Local links refer to the audited checkout. Browser/library guidance was researched from primary documentation. Priorities, timing thresholds, and proposed design choices are engineering recommendations, not measured production results.

[task-hooks]: C:/Users/dheer/OneDrive/Desktop/100x/resource/hooks/queries/tasks.ts:156
[resource-hooks]: C:/Users/dheer/OneDrive/Desktop/100x/resource/hooks/queries/resources.ts:210
[project-hooks]: C:/Users/dheer/OneDrive/Desktop/100x/resource/hooks/queries/projects.ts:69
[settings-hooks]: C:/Users/dheer/OneDrive/Desktop/100x/resource/hooks/queries/settings.ts:30
[trash-hooks]: C:/Users/dheer/OneDrive/Desktop/100x/resource/hooks/queries/trash.ts:19
[quick-note-hooks]: C:/Users/dheer/OneDrive/Desktop/100x/resource/hooks/queries/quick-notes.ts:68
[reminder-hooks]: C:/Users/dheer/OneDrive/Desktop/100x/resource/hooks/queries/reminders.ts:52
[tag-hooks]: C:/Users/dheer/OneDrive/Desktop/100x/resource/hooks/queries/tags.ts:24
[task-board]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/tasks/task-board.tsx:145
[task-checklist]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/tasks/task-checklist.tsx:145
[calendar-view]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/calendar/calendar-view.tsx:100
[calendar-side-panel]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/calendar/calendar-side-panel.tsx:51
[note-editor]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/resources/full-view/note-editor.tsx:457
[quick-note-dialog]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/quick-notes/quick-note-dialog.tsx:169
[reminders-bell]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/calendar/reminders-bell.tsx:69
[sidebar]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/shell/sidebar.tsx:78
[command-palette]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/search/command-palette.tsx:73
[search-view]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/search/search-view.tsx:238
[confirm-dialog]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/confirm-dialog.tsx:49
[masonry]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/resources/masonry.tsx:102
[resource-list]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/resources/resource-list.tsx:41
[resource-dal]: C:/Users/dheer/OneDrive/Desktop/100x/resource/lib/server/dal/resources.ts:87
[task-dal]: C:/Users/dheer/OneDrive/Desktop/100x/resource/lib/server/dal/tasks.ts:146
[quick-note-dal]: C:/Users/dheer/OneDrive/Desktop/100x/resource/lib/server/dal/quick-notes.ts:69
[youtube-player]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/resources/embeds/youtube-player.tsx:57
[instagram-embed]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/resources/embeds/instagram-embed.tsx:62
[x-embed]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/resources/embeds/x-embed.tsx:38
[media-controller]: C:/Users/dheer/OneDrive/Desktop/100x/resource/hooks/use-media-controller.ts:50
[resource-image]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/resources/embeds/resource-image.tsx:60
[app-shell]: C:/Users/dheer/OneDrive/Desktop/100x/resource/components/shell/app-shell.tsx:5
[uploads]: C:/Users/dheer/OneDrive/Desktop/100x/resource/hooks/use-uploads.ts:128
[next-lazy-guide]: C:/Users/dheer/OneDrive/Desktop/100x/resource/node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md:9
