"use client"

import { useEffect, useRef } from "react"
import {
  createUniver,
  LocaleType,
  mergeLocales,
  type IWorkbookData,
} from "@univerjs/presets"
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core"
import coreLocale from "@univerjs/preset-sheets-core/locales/en-US"
import { UniverSheetsFilterPreset } from "@univerjs/preset-sheets-filter"
import filterLocale from "@univerjs/preset-sheets-filter/locales/en-US"
import { UniverSheetsSortPreset } from "@univerjs/preset-sheets-sort"
import sortLocale from "@univerjs/preset-sheets-sort/locales/en-US"
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation"
import validationLocale from "@univerjs/preset-sheets-data-validation/locales/en-US"
import "@univerjs/preset-sheets-core/lib/index.css"
import "@univerjs/preset-sheets-filter/lib/index.css"
import "@univerjs/preset-sheets-sort/lib/index.css"
import "@univerjs/preset-sheets-data-validation/lib/index.css"

export default function SheetEditor({
  initial,
  onChange,
  onReady,
}: {
  initial: Partial<IWorkbookData>
  onChange: (workbook: IWorkbookData) => void
  onReady: (getSnapshot: () => Promise<IWorkbookData>) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onChange, onReady })
  useEffect(() => {
    callbacks.current = { onChange, onReady }
  }, [onChange, onReady])
  useEffect(() => {
    if (!container.current) return
    const host = document.createElement("div")
    host.style.height = "100%"
    container.current.appendChild(host)
    const { univer, univerAPI } = createUniver({
      locale: LocaleType.EN_US,
      locales: {
        [LocaleType.EN_US]: mergeLocales(
          coreLocale,
          filterLocale,
          sortLocale,
          validationLocale
        ),
      },
      presets: [
        UniverSheetsCorePreset({ container: host }),
        UniverSheetsFilterPreset(),
        UniverSheetsSortPreset(),
        UniverSheetsDataValidationPreset(),
      ],
    })
    const workbook = univerAPI.createWorkbook(initial)
    if (initial.name === "Job tracker" && !initial.resources?.length) {
      const status = univerAPI
        .newDataValidation()
        .requireValueInList([
          "Interested",
          "Applied",
          "Screening",
          "Interview",
          "Offer",
          "Rejected",
          "Withdrawn",
        ])
        .build()
      workbook.getActiveSheet().getRange("C2:C500").setDataValidation(status)
    }
    callbacks.current.onReady(async () => {
      await workbook.endEditingAsync(true)
      return workbook.save()
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    const subscription = workbook.onCommandExecuted((command) => {
      if (!command.id.includes("mutation")) return
      clearTimeout(timer)
      timer = setTimeout(() => callbacks.current.onChange(workbook.save()), 100)
    })
    return () => {
      clearTimeout(timer)
      subscription.dispose()
      host.remove()
      queueMicrotask(() => univer.dispose())
    }
    // A new document/import is deliberately mounted with a new key by the host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      ref={container}
      className="h-full min-h-80 w-full"
      aria-label="Editable spreadsheet"
    />
  )
}
