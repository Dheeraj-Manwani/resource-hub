"use client"

import { useRef } from "react"
import { Excalidraw, serializeAsJSON, MainMenu } from "@excalidraw/excalidraw"
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  AppState,
  BinaryFiles,
} from "@excalidraw/excalidraw/types"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type { DrawingData } from "@/lib/docs/drawing"
import "@excalidraw/excalidraw/index.css"

Object.assign(window, { EXCALIDRAW_ASSET_PATH: "/api/drawing-assets/" })

export default function DrawingEditor({
  initial,
  onChange,
  onReady,
}: {
  initial: DrawingData
  onChange: (drawing: DrawingData) => void
  onReady: (
    getSnapshot: (commitEditing?: boolean) => Promise<DrawingData>,
    baseline: DrawingData
  ) => void
}) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null)
  const last = useRef(JSON.stringify(initial))
  const initialized = useRef(false)

  async function getSnapshot(commitEditing = true) {
    const instance = api.current!
    const active = document.activeElement
    if (
      commitEditing &&
      active instanceof HTMLTextAreaElement &&
      active.closest(".excalidraw")
    ) {
      active.blur()
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      )
    }
    return snapshot(
      instance.getSceneElements(),
      instance.getAppState(),
      instance.getFiles()
    )
  }

  function snapshot(
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles
  ) {
    // Excalidraw's serializer removes deleted elements and transient UI state.
    // Validate at save/import boundaries so an oversized scene remains editable.
    const serialized = JSON.parse(
      serializeAsJSON(elements, appState, files, "local")
    )
    return {
      type: "excalidraw",
      version: 2,
      source: "Resource Hub",
      elements: serialized.elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
        gridStep: appState.gridStep,
        gridModeEnabled: appState.gridModeEnabled,
      },
      files: serialized.files ?? {},
    } as DrawingData
  }

  return (
    <div className="h-full w-full" aria-label="Editable drawing">
      <Excalidraw
        initialData={
          // Excalidraw restores optional defaults on imported scene elements.
          {
            ...initial,
            scrollToContent: true,
          } as unknown as ExcalidrawInitialDataState
        }
        theme="dark"
        validateEmbeddable={false}
        excalidrawAPI={(instance) => {
          api.current = instance
        }}
        onChange={(elements, appState, files) => {
          if (!api.current || appState.isLoading) return
          const value = snapshot(elements, appState, files)
          const contents = JSON.stringify(value)
          // The first restored scene establishes a baseline, including defaults
          // and text measurements added by Excalidraw during initialization.
          if (!initialized.current) {
            initialized.current = true
            last.current = contents
            onReady(getSnapshot, value)
            return
          }
          if (contents === last.current) return
          last.current = contents
          onChange(value)
        }}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
    </div>
  )
}
