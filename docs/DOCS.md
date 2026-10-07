# Docs

Quick Notes is now Docs. Existing notes remain text docs, with the same title and rich-text editor. The original database table and write API names stay in place for compatibility; `/quick-notes` redirects to `/docs`.

## Spreadsheets

Choose **New doc → Spreadsheet** for an empty workbook, or **Job tracker** for application columns and a status dropdown. The editor supports multiple sheets, formulas, formatting, sorting, filtering and cell validation through Univer. Workbooks are stored as JSON in Postgres, with no external office service.

Edits autosave after a short pause. Save and Ctrl/Cmd+S also commit the active cell. Failed saves leave the editor open. Revision checks prevent an older tab from silently replacing a newer save; download a backup before reopening a conflicting doc.

**History** shows up to 50 earlier saves and can restore one as a new revision. Deleted docs move to **Docs → Trash**, where they can be restored. Docs can belong to a project and are included in the account JSON export.

## Import and export

- **Import** accepts `.xlsx` and native `.json` backups and replaces the open workbook.
- **Export Excel** produces `.xlsx` with cell values, formulas, basic formatting, merges, widths and frozen rows. It does not preserve charts, images, macros, advanced Excel features, or all validation/filter settings. Keep original Office files.
- Excel imports keep values, formulas and basic cell formatting. Dates become ISO date text. Layout and advanced Office features are not imported.
- **Backup** downloads the full native workbook snapshot, including the editor's saved resources. Use this format to preserve in-app features.
- Limits: 10 MB import file, 30 sheets, 50,000 filled cells for Excel import, 100,000 rows and 1,000 columns per sheet, and 3 MB saved workbook JSON. This is intended for everyday trackers, not huge datasets.

## Setup

Install dependencies with `pnpm install`, then run `pnpm db:migrate` before opening Docs. Migration `0009_new_sue_storm.sql` adds doc types, revisions, soft deletion and version history without replacing existing note content. The editor is loaded only when a spreadsheet is opened.

Validation: `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e tests/e2e/docs.spec.ts --project=desktop`. Browser tests require the local database.
