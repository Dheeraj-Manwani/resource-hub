"use client"

import {
  ArrowUpRightIcon,
  BriefcaseBusinessIcon,
  FileTextIcon,
  FilesIcon,
  PenLineIcon,
  Table2Icon,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type DocChoice = "text" | "spreadsheet" | "drawing" | "job-tracker"

const blankDocs = [
  {
    kind: "text",
    title: "Text",
    description: "Write freely, add images and links",
    label: "Text — write freely, add images and links",
    icon: FileTextIcon,
    accent: "bg-sky-400/10 text-sky-400 ring-sky-400/15",
  },
  {
    kind: "spreadsheet",
    title: "Spreadsheet",
    description: "Start with a blank sheet",
    label: "Spreadsheet — start with a blank sheet",
    icon: Table2Icon,
    accent: "bg-emerald-400/10 text-emerald-400 ring-emerald-400/15",
  },
  {
    kind: "drawing",
    title: "Drawing",
    description: "Sketch freely with Excalidraw",
    label: "Drawing — sketch freely with Excalidraw",
    icon: PenLineIcon,
    accent: "bg-violet-400/10 text-violet-400 ring-violet-400/15",
  },
] as const

export function NewDocPicker({
  onChoose,
  onOpenChange,
}: {
  onChoose: (choice: DocChoice) => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl gap-0 overflow-y-auto rounded-2xl p-0 shadow-popover transition-none sm:max-w-2xl">
        <DialogHeader className="gap-4 px-5 pt-6 pb-5 sm:px-6">
          <div className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand ring-1 ring-brand/20">
            <FilesIcon aria-hidden="true" className="size-5" />
          </div>
          <div className="space-y-2">
            <DialogTitle className="text-xl font-semibold tracking-tight">
              New doc
            </DialogTitle>
            <DialogDescription>
              A space for your next idea. Choose how you want to start.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="px-5 pb-6 sm:px-6">
          <p className="mb-3 text-[11px] font-medium tracking-wider text-subtle uppercase">
            Start from scratch
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {blankDocs.map(
              ({ kind, title, description, label, icon: Icon, accent }) => (
                <button
                  key={kind}
                  type="button"
                  aria-label={label}
                  onClick={() => onChoose(kind)}
                  className="group relative flex items-center gap-4 rounded-xl border border-border-strong/70 bg-surface p-4 text-left transition-[background-color,border-color,box-shadow,transform] outline-none hover:border-brand/50 hover:bg-surface-raised hover:shadow-card focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 motion-safe:hover:-translate-y-0.5 sm:min-h-44 sm:flex-col sm:items-start sm:gap-5"
                >
                  <span
                    className={`flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ${accent}`}
                  >
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1.5">
                    <span className="block font-semibold text-foreground">
                      {title}
                    </span>
                    <span className="block text-xs leading-relaxed text-text-muted">
                      {description}
                    </span>
                  </span>
                  <ArrowUpRightIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-subtle transition-colors group-hover:text-brand group-focus-visible:text-brand sm:absolute sm:top-4 sm:right-4"
                  />
                </button>
              )
            )}
          </div>
        </div>

        <div className="border-t bg-surface/50 px-5 py-5 sm:px-6">
          <p className="mb-3 text-[11px] font-medium tracking-wider text-subtle uppercase">
            Start with a template
          </p>
          <button
            type="button"
            aria-label="Job tracker — start with application columns"
            onClick={() => onChoose("job-tracker")}
            className="group flex w-full items-center gap-4 rounded-xl border border-border-strong/70 bg-surface p-4 text-left transition-colors outline-none hover:border-brand/50 hover:bg-surface-raised focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400 ring-1 ring-amber-400/15">
              <BriefcaseBusinessIcon aria-hidden="true" className="size-5" />
            </span>
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="block font-semibold text-foreground">
                Job tracker
              </span>
              <span className="block text-xs leading-relaxed text-text-muted">
                A spreadsheet ready for your applications
              </span>
            </span>
            <ArrowUpRightIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-subtle transition-colors group-hover:text-brand group-focus-visible:text-brand"
            />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
