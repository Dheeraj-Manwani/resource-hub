"use client"

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
} from "react"

/**
 * "Only one video plays": a single active-media store. Starting a player
 * pauses controllable players (YouTube via the IFrame API) and resets
 * non-controllable embeds (Instagram, X, Pinterest) back to their poster.
 */
type Controls = { pause?: () => void; reset?: () => void }

const registry = new Map<string, React.RefObject<Controls>>()
const listeners = new Set<() => void>()
let activeId: string | null = null

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function activateMedia(id: string) {
  if (activeId === id) return
  const previous = activeId ? registry.get(activeId)?.current : undefined
  activeId = id
  if (previous?.pause) previous.pause()
  else previous?.reset?.()
  emit()
}

export function deactivateMedia(id: string) {
  if (activeId !== id) return
  activeId = null
  emit()
}

export function useMediaController(controls: Controls) {
  const id = useId()
  const controlsRef = useRef<Controls>(controls)
  useEffect(() => {
    controlsRef.current = controls
  })

  useEffect(() => {
    registry.set(id, controlsRef)
    return () => {
      registry.delete(id)
      deactivateMedia(id)
    }
  }, [id])

  const isActive = useSyncExternalStore(
    subscribe,
    () => activeId === id,
    () => false
  )

  return {
    id,
    isActive,
    activate: useCallback(() => activateMedia(id), [id]),
    deactivate: useCallback(() => deactivateMedia(id), [id]),
  }
}
