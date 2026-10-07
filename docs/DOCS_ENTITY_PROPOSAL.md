# Docs entity: product and technical proposal

Research date: 7 October 2026. Proposal only; no editor has been integrated or compatibility-tested.

## Recommendation

Add Docs as a first-class workspace for editable documents, starting with Word documents and Excel workbooks. Evaluate ONLYOFFICE Docs first for the requested Office-file workflow, with Collabora Online as the alternative. Choose the engine through actual import/edit/export tests and deployment/licensing fit, not screenshots or feature lists.

Reuse Resource Hub's existing ownership, projects, tasks, tags, files and search infrastructure. Start with one office engine. Retain Tiptap for existing notes; add native long-form pages later if they deliver a meaningfully different workflow.

The product promise should be: create or import a document, edit it inside Resource Hub, return later without losing work, connect it to a project or task, and export a usable file. Perfect fidelity for every Microsoft Office feature is not a safe initial promise.

## Existing implementation

- `lib/validation/resources.ts` already permits Word, Excel and PowerPoint MIME types alongside PDFs and other files.
- `lib/server/upload-service.ts` creates uploaded file resources. Its extraction path covers PDFs, not Word or Excel content.
- `components/resources/full-view/resource-full-view.tsx` previews PDF/video/audio; other file types get a download-oriented fallback.
- `lib/server/r2.ts` provides R2 storage, five-minute signed URLs and an optional public URL path.
- Notes already use Tiptap, but that does not provide Excel editing or automatically provide full Word compatibility.
- Existing resource–project and task–resource relationships make document linking feasible without introducing a parallel library.

## Product boundaries and document types

Quick Notes remain fast scratchpads. Existing note resources remain lightweight organized notes. Docs represent durable editable work: reports, plans, workbooks and, later, presentations.

Launch candidates:

1. Document: create/import/edit/export DOCX; export a PDF rendition.
2. Spreadsheet: create/import/edit/export XLSX; import CSV with a preview; export a selected worksheet as CSV or an appropriately configured PDF.
3. PDF: initially view, search, attach and annotate if the selected engine supports the required annotation flow. PDF layout editing and scanned-document OCR are separate capabilities.

Later: PPTX presentations, native pages, Markdown/text docs, fillable templates and diagram canvases. An arbitrary uploaded attachment should remain usable even when no editor supports it.

Legacy DOC/XLS and other formats should use explicit conversion into an editable working copy, retaining the original. Encrypted, macro-enabled and unsupported files need explicit handling. Do not claim that VBA, external data connections or advanced workbook features execute merely because a file opens.

## Editor options

### ONLYOFFICE Docs — preferred first evaluation

Its document-server model fits embedding Office editing while Resource Hub retains document management and storage. The host issues editor configuration, serves the file, handles callbacks and stores saved output. A browser editor event alone does not establish a durable save.

The official save flow sends a callback containing a URL from which the host retrieves the updated file. Force-save can produce a current snapshot during an active session. Resource Hub must implement both persistence and user-visible save state correctly. [Save flow](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/saving-file), [callback contract](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler).

Tradeoffs: an additional deployed service or provider, office-style embedded UI, edition-dependent features and licensing. The Community and commercial offerings differ; evaluate the Developer edition for commercial embedding/branding rather than assuming a free distribution fits every deployment. [Developer offering](https://www.onlyoffice.com/developer-edition-prices), [edition FAQ](https://helpcenter.onlyoffice.com/docs/faq/docs-enterprise.aspx).

Do not run the office server as a short-lived Next.js request handler. Plan separate persistent infrastructure, TLS, access to file endpoints, callback reachability, monitoring and backup.

### Collabora Online — credible alternative

Collabora integrates through WOPI: the host owns identity/storage and implements file metadata, retrieval, persistence and appropriate locking. Evaluate it if its format support, deployment model or commercial terms better match the app.

CODE is its development/testing edition; the vendor does not recommend it for production business use. [Integration options](https://www.collaboraonline.com/integrate-collabora-online/), [vendor FAQ](https://www.collaboraonline.com/faqs/).

### Tiptap plus Univer — deeper native customization

This route is attractive for app-native pages and sheets with embedded Resource Hub entities. It is a larger product investment: document schemas, conversions, collaboration, previews and consistency must work across two editor systems.

Tiptap provides DOCX conversion, but explicitly excludes pixel-perfect Word rendering and round-trip identity. Existing StarterKit usage is not the complete conversion setup. [DOCX limitations](https://tiptap.dev/docs/conversion/export/docx/editor-extension).

Univer has a spreadsheet model and editor; its documented Office import/export uses server capabilities and Pro packages. Native snapshots and exported XLSX are different representations with a conversion boundary. [Univer import/export](https://docs.univer.ai/guides/sheets/features/import-export).

Pick this route when bespoke in-app interaction matters more than preserving arbitrary imported Office files. Do not present a cell grid or file parser as a complete spreadsheet editor.

### Microsoft and Google integrations

Microsoft 365 web editing is possible through its Cloud Storage Partner Program and WOPI, with eligibility, onboarding and validation requirements. It is not a general-purpose free editor iframe; this personal app should not depend on qualification. [Microsoft program overview](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/online/overview).

Google Docs APIs can create/read/modify documents, but those APIs are not an embeddable editor component. Treat Drive/Docs/Sheets as optional import/export or externally linked sources with clearly defined ownership and sync behavior. [Google Docs API](https://developers.google.com/workspace/docs/api/how-tos/overview).

## Core user experience

Docs opens with Recent, All, Starred, Templates and Trash, with filters for type, project, tag and state. Reuse saved-view infrastructure if it is implemented. Avoid another folder system duplicating Projects in the first release.

New offers Document, Spreadsheet and From template; Import supports drag-and-drop and a multi-file progress queue. Each import shows format, processing state and any detected conversion warnings.

A document opens in a full-page workspace, with its title and save state, editor, and collapsible context panel for projects, tags, linked tasks/resources, versions and document-level discussion. Small previews belong in drawers; an entire spreadsheet generally needs the full viewport.

Actions: rename, star, duplicate, attach to project/task, download original, export current version, save a named version, archive, trash, restore and inspect history. Make unsupported editing an explicit state with a preserved download.

## Feature ideas, ordered by value

### Essential: trustworthy editing

- Reliable autosave and explicit durable-save status: saving, persisted, retrying or failed.
- Stable document identity across renames, version changes and exports.
- Immutable original and saved versions; restoring a version creates a new head.
- Reopen/reload recovery, independent of optimistic UI feedback.
- Duplicate-as-new-document and Save as template.
- Correct export of the latest persisted state; export during an active session must flush or clearly identify the saved snapshot.
- Trash and a documented retention policy, including retained attachment/version references.
- Search extracted document text and workbook sheet names/cell text with snippets. Avoid returning the entire workbook to power a search result.

### High value: connections to existing entities

- Attach a document to multiple projects using existing resource links, without copying it.
- Open a spec next to its implementation task; open a budget next to a project.
- Create tasks from selected action items, preserving a source link and preventing duplicate creation on retry.
- Link to a heading, paragraph, sheet, named range or cell where the editor API supports it. Begin with document-level links if stable anchors are unavailable.
- Show backlinks from resources and tasks, including which version was referenced.
- Build a project report from selected resources, notes and completed tasks; keep citations and source links.
- Promote a quick note into a document without losing the original or its images.

### High value: visualization

- Spreadsheet charts, filters, frozen headers and conditional formatting through the editor's supported capabilities.
- Pin a chart or named range to a project overview. Label whether it is a live view or a snapshot, show freshness, and apply the document's access rules.
- Show document versions on a compact timeline with author/time/label; add text or cell diffs only when reliable comparison is available.
- Outline navigation for long docs and sheet navigation/search for workbooks.
- Side-by-side source and draft: a research resource beside a report, or two versions during review.
- A document's local relationship map: source material, derived work and tasks.

### Later: structured workflows

- Templates for meeting minutes, research reports, project briefs, budgets, inventories, trackers and weekly reviews.
- Template variables populated from project metadata, with an explicit choice between inserted snapshots and live fields.
- CSV rows mapped into tasks/resources after preview, validation and duplicate checks. Treat this as an import transaction, not ongoing two-way sync.
- Approval state: draft, in review, approved, superseded. Approved versions remain immutable even while a new draft develops.
- Optional reminders for documents needing review; maintenance views for missing project context or outdated generated reports.
- Real-time collaboration, comments, suggestions and presence, after Resource Hub has a genuine sharing/permission model. Coediting in an engine does not supply application authorization.
- External document links with a clear source-of-truth indicator. Avoid silent two-way sync in the first version.
- AI summarization, formula explanation, source-grounded drafting and proposed edits with preview/accept/reject. Do not rely on AI to provide arithmetic correctness or file-format fidelity.

## Import/export policy

Distinguish three actions: edit the Office working file; convert to a native editable copy; preserve as an attachment. Retain the uploaded original in every conversion workflow.

For CSV import, preview delimiter, encoding, headers, date/number parsing and leading zeros. For export, explain that CSV represents one sheet and cannot preserve multi-sheet structure, styling, charts or a complete workbook model.

For DOCX/XLSX, test content, layout, formulas, charts and unsupported features across import → edit → save → export. Conversion warnings should identify known limitations; do not imply the app can detect every possible loss.

Whole-library backup should include metadata, original files, chosen saved versions, attachments and relationships. A ZIP of exported files and a restorable app backup are distinct deliverables.

## Data and architecture

Recommended initial model: a first-class Docs UI backed by an extension of a resource. Introduce a `document` resource type and a one-to-one document record, with a document kind such as word/sheet/slides/pdf and a selected editor provider. Existing project/resource and task/resource joins remain the single source for those relationships.

An alternative separate documents table with a universal entity system could make sense later; it introduces more search, tag, trash, export and authorization integration work now. Do not maintain two independently editable copies of the same document metadata.

Proposed records:

- Document: resource ID, kind, provider, original version, current version, processing state and optional external origin.
- Version: immutable file reference, parent version, checksum, MIME/size, creator/time, source (import/save/restore), label and conversion warnings.
- Editor session: document ID, base version, provider session key, permitted capability, expiration and persistence state.
- Derived assets: preview, extracted text, search chunks and thumbnails tied to an exact version.
- File references: explicit links from document versions and attachments so cleanup can preserve all live references.

Do not use a single cached `resource.file` value to infer the current document after introducing versioning. The version head must determine it. Resource list DTOs should remain small.

Office-file workflow: browser requests an authorized edit session; backend issues scoped configuration; office service reads the permitted version; authenticated save callback delivers a new file; storage persists a new immutable object; a transaction advances the version head; background jobs update previews/indexes.

For ONLYOFFICE, keep a stable key for the active coediting session and rotate it according to the provider lifecycle after a saved session; never blindly rotate on every autosave. Deduplicate retries and prevent late callbacks from replacing a newer head. Do not acknowledge persistence before the file is durably stored or safely staged according to the provider contract.

App-level documents should stay private. Reusing `publicUrlFor` indiscriminately would defeat that goal. Use authenticated service access or purpose-scoped file access with a lifecycle suited to the editor; do not assume the existing five-minute URLs cover every session/retry. Validate callback authenticity and constrain downloadable callback URLs to the configured service.

Background conversion/extraction should be size/time bounded and isolated from normal requests. Save failures and conversion failures must not replace the original or mark a document as successfully saved.

## Phased delivery

### Gate 1: compatibility and infrastructure spike

Use representative DOCX/XLSX samples: ordinary reports, page layouts, images/tables, formulas, multiple sheets, named ranges, charts, dates and Unicode. Test comments/track changes and pivots where required. Include unsupported or protected examples to verify honest fallback.

Demonstrate edit → persist to R2 → close → reopen → export. Test a long session, browser refresh, two tabs, duplicate/out-of-order callbacks, expired access, provider interruption and storage failure. Record import/export differences and operational requirements.

Do not select an engine until this gate passes for the intended scope. Check current license and deployment terms before committing the product to an engine.

### Release 1: useful Docs

DOCX/XLSX creation and import, embedded editing, save status, reopen, export, project/task links, tags, search, immutable original, basic version restore and Trash. PDF preview can reuse the current path. Skip public sharing initially.

### Release 2: connected work

Templates, note promotion, linked tasks, document-level discussions, named versions, preview generation, better search and selected chart/range snapshots.

### Release 3: advanced workflows

Stable content anchors, live dashboards, shared editing with permissions, approvals, detailed comparison, presentations, external integrations and previewed AI actions. Add native pages/sheets only when their benefits justify maintaining another canonical format/editor path.

## Acceptance and measurement

Measure reopen success after save, export compatibility on the sample corpus, time to first editable state, failed-save recovery, document search success and version-storage growth. Keep performance targets provisional until there is a baseline and representative file distribution.

The release must pass: own-document isolation, reliable persistence across reload, recoverable failures, idempotent callbacks, no stale overwrite, restoration without destroying history, and matching file versions for export/index/preview. Visual editing success alone is insufficient.

No application changes, deployments, installations or external account changes were made for this research.
