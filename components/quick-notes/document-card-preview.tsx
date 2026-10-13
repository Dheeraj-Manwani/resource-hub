import { PencilRulerIcon } from "lucide-react"
import type { IWorkbookData, ICellData } from "@univerjs/presets"
import type { DrawingData } from "@/lib/docs/drawing"
import type { QuickNoteDto } from "@/lib/quick-notes/dto"

function cellText(cell: ICellData | null | undefined) {
  return String(cell?.v ?? cell?.p?.body?.dataStream?.trim() ?? "")
}

function SpreadsheetPreview({ data }: { data: unknown }) {
  const workbook = data as Partial<IWorkbookData> | null
  const sheetIds = workbook?.sheetOrder ?? []
  const sheet = workbook?.sheets?.[sheetIds[0]]
  // Keep row/column positions intact, including gaps between populated cells.
  const firstRow = Object.keys(sheet?.cellData ?? {}).find((key) =>
    Object.values(sheet?.cellData?.[Number(key)] ?? {}).some((cell) =>
      cellText(cell)
    )
  )
  const start = Number(firstRow ?? 0)
  return (
    <div className="flex h-full flex-col text-[11px]">
      <div className="flex items-center gap-2 border-b border-border/70 bg-emerald-400/[0.04] px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate font-medium text-emerald-300/90">
          {sheet?.name || "Empty spreadsheet"}
        </span>
        {sheetIds.length > 1 && (
          <span className="shrink-0 text-subtle">{sheetIds.length} sheets</span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <table
          className="w-full table-fixed border-collapse text-text-muted"
          aria-label="Spreadsheet preview"
        >
          <colgroup>
            <col className="w-7" />
            <col />
            <col />
            <col />
          </colgroup>
          <tbody>
            {Array.from({ length: 4 }, (_, offset) => {
              const row = start + offset
              return (
                <tr
                  key={row}
                  className="h-6 border-b border-border/60 last:border-0"
                >
                  <td className="border-r border-border/60 bg-white/[0.02] text-center text-[10px] text-subtle">
                    {row + 1}
                  </td>
                  {[0, 1, 2].map((column) => (
                    <td
                      key={column}
                      className="border-r border-border/60 px-2 last:border-0"
                    >
                      <div className="truncate">
                        {cellText(sheet?.cellData?.[row]?.[column])}
                      </div>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function DocumentCardPreview({ note }: { note: QuickNoteDto }) {
  if (note.kind === "spreadsheet")
    return <SpreadsheetPreview data={note.bodyJson} />
  if (note.kind === "drawing") {
    const drawing = note.bodyJson as DrawingData | null
    const count =
      drawing?.elements?.filter((element) => !element.isDeleted).length ?? 0
    const labels = drawing?.elements
      ?.filter((element) => !element.isDeleted && element.text)
      .map((element) => element.text)
      .join(" · ")
    return (
      <div className="flex h-full items-center gap-3 [background-image:radial-gradient(var(--border-strong)_1px,transparent_1px)] [background-size:12px_12px] p-3">
        <PencilRulerIcon
          aria-hidden="true"
          className="size-8 shrink-0 text-violet-300/50"
        />
        <div className="min-w-0 rounded-md bg-surface/90 px-2 py-1">
          <p className="text-xs text-text-muted">
            {count
              ? `${count} element${count === 1 ? "" : "s"} on canvas`
              : "A blank canvas"}
          </p>
          {labels && (
            <p className="mt-1 line-clamp-2 text-xs text-subtle">{labels}</p>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="h-full border-l-2 border-sky-400/20 px-3 py-2.5">
      <p className="line-clamp-4 text-[13px] leading-[1.6] break-words whitespace-pre-line text-text-muted">
        {note.bodyText?.trim() || (
          <span className="text-subtle">Start writing your ideas…</span>
        )}
      </p>
    </div>
  )
}
