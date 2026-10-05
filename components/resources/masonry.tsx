"use client"

import {
  defaultRangeExtractor,
  useWindowVirtualizer,
} from "@tanstack/react-virtual"
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { MasonryRetention } from "./masonry-retention"

const GAP = 16
const FOCUSABLE =
  'button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]'
function columnsFor(width: number) {
  return width < 600 ? 1 : width < 960 ? 2 : width < 1400 ? 3 : 4
}
function RetainedCard({
  id,
  retain,
  children,
}: {
  id: string
  retain: (id: string, active: boolean) => void
  children: ReactNode
}) {
  const owners = useRef(new Set<string>())
  const update = useCallback(
    (source: string, active: boolean) => {
      if (active) owners.current.add(source)
      else owners.current.delete(source)
      retain(id, owners.current.size > 0)
    },
    [id, retain]
  )
  return (
    <MasonryRetention.Provider value={update}>
      {children}
    </MasonryRetention.Provider>
  )
}

/** Measured shortest-lane placement with a bounded window of mounted cards. */
export function Masonry<T>({
  items,
  getKey,
  renderItem,
}: {
  items: T[]
  getKey: (item: T) => string
  renderItem: (item: T) => ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [geometry, setGeometry] = useState({ width: 0, offset: 0 })
  const [retained, setRetained] = useState<Set<string>>(() => new Set())
  const [focused, setFocused] = useState<string | null>(null)
  const [pointer, setPointer] = useState<string | null>(null)
  const focusNext = useRef<{ key: string; last: boolean } | null>(null)
  const keys = items.map(getKey)
  const liveKeys = new Set(keys)
  if ([...retained].some((key) => !liveKeys.has(key)))
    setRetained(new Set([...retained].filter((key) => liveKeys.has(key))))
  const retain = useCallback((id: string, active: boolean) => {
    setRetained((prev) => {
      if (prev.has(id) === active) return prev
      const next = new Set(prev)
      if (active) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      const width = Math.floor(rect.width),
        offset = rect.top + window.scrollY
      setGeometry((prev) =>
        prev.width === width && prev.offset === offset
          ? prev
          : { width, offset }
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener("resize", update)
    const release = () => setPointer(null)
    window.addEventListener("pointerup", release)
    window.addEventListener("pointercancel", release)
    window.addEventListener("blur", release)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", update)
      window.removeEventListener("pointerup", release)
      window.removeEventListener("pointercancel", release)
      window.removeEventListener("blur", release)
    }
  }, [])
  const lanes = columnsFor(geometry.width)
  const columnWidth = (geometry.width - GAP * (lanes - 1)) / lanes
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    lanes,
    gap: GAP,
    estimateSize: () => 320,
    getItemKey: (index) => keys[index]!,
    scrollMargin: geometry.offset,
    overscan: lanes * 3,
    rangeExtractor: (range) =>
      [
        ...new Set([
          ...defaultRangeExtractor(range),
          ...keys.flatMap((key, index) =>
            retained.has(key) || key === focused || key === pointer
              ? [index]
              : []
          ),
        ]),
      ].sort((a, b) => a - b),
  })
  useLayoutEffect(() => {
    virtualizer.measure()
  }, [columnWidth, virtualizer])
  useLayoutEffect(() => {
    const live = new Set(keys)
    for (const key of virtualizer.itemSizeCache.keys())
      if (!live.has(String(key))) virtualizer.itemSizeCache.delete(key)
  }, [keys, virtualizer])
  const visibleRows = virtualizer.getVirtualItems()
  // A range can briefly be empty while measured heights shrink at the end of
  // a fast scroll. Focus/player/drag ownership still requires a mounted node.
  const pinned = keys.flatMap((key, index) =>
    retained.has(key) || key === focused || key === pointer ? [index] : []
  )
  const measurements = virtualizer.measurementsCache
  const rows = [
    ...visibleRows,
    ...pinned
      .filter((index) => !visibleRows.some((row) => row.index === index))
      .map((index) => measurements[index]!)
      .filter(Boolean),
  ].sort((a, b) => a.index - b.index)
  useLayoutEffect(() => {
    if (!focusNext.current) return
    const node = Array.from(containerRef.current?.children ?? []).find(
      (child) => (child as HTMLElement).dataset.key === focusNext.current?.key
    )
    const controls = Array.from(
      node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
    ).filter((el) => el.getClientRects().length)
    const target = focusNext.current.last ? controls.at(-1) : controls[0]
    if (target) {
      target.focus()
      focusNext.current = null
    }
  }, [rows])
  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize(), overflowAnchor: "none" }}
    >
      {rows.map((row) => {
        const item = items[row.index]!,
          key = getKey(item)
        return (
          <div
            key={key}
            data-key={key}
            data-index={row.index}
            ref={virtualizer.measureElement}
            className="absolute"
            style={{
              top: row.start - geometry.offset,
              left: row.lane * (columnWidth + GAP),
              width: columnWidth || "100%",
            }}
            onFocusCapture={() => setFocused(key)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setFocused((prev) => (prev === key ? null : prev))
            }}
            onPointerDownCapture={() => setPointer(key)}
            onKeyDownCapture={(event) => {
              if (event.key !== "Tab") return
              const controls = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)
              ).filter((node) => node.getClientRects().length)
              if (
                event.target !==
                (event.shiftKey ? controls[0] : controls.at(-1))
              )
                return
              const next = row.index + (event.shiftKey ? -1 : 1)
              if (
                next < 0 ||
                next >= items.length ||
                rows.some((entry) => entry.index === next)
              )
                return
              event.preventDefault()
              event.stopPropagation()
              focusNext.current = { key: keys[next]!, last: event.shiftKey }
              setFocused(keys[next]!)
              virtualizer.scrollToIndex(next, { align: "auto" })
            }}
          >
            <RetainedCard id={key} retain={retain}>
              {renderItem(item)}
            </RetainedCard>
          </div>
        )
      })}
    </div>
  )
}
