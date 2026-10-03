"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const ESTIMATED_HEIGHT = 320
const GAP = 16

function columnsFor(width: number) {
  if (width < 600) return 1
  if (width < 960) return 2
  if (width < 1400) return 3
  return 4
}

/**
 * Masonry with shortest-column placement: items are placed in order into
 * whichever column is currently shortest, using measured heights. Items are
 * absolutely positioned inside one parent so a card that changes column
 * keeps its React state (a playing video doesn't restart).
 */
export function Masonry<T>({
  items,
  getKey,
  renderItem,
}: {
  items: T[]
  getKey: (item: T) => string
  renderItem: (item: T) => React.ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [heights, setHeights] = useState<Map<string, number>>(() => new Map())
  const observerRef = useRef<ResizeObserver | null>(null)
  const pending = useRef(new Map<string, number>())
  const frame = useRef<number | undefined>(undefined)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const getObserver = useCallback(() => {
    observerRef.current ??= new ResizeObserver((entries) => {
      for (const entry of entries) {
        const key = (entry.target as HTMLElement).dataset.key
        if (key)
          pending.current.set(
            key,
            Math.round(
              entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height
            )
          )
      }
      if (frame.current === undefined) {
        frame.current = requestAnimationFrame(() => {
          frame.current = undefined
          const updates = pending.current
          pending.current = new Map()
          setHeights((prev) => {
            let changed = false
            for (const [k, h] of updates) if (prev.get(k) !== h) changed = true
            if (!changed) return prev
            const next = new Map(prev)
            for (const [k, h] of updates) next.set(k, h)
            return next
          })
        })
      }
    })
    return observerRef.current
  }, [])

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    }
  }, [])

  // Ref callbacks run before effects, so the observer is created lazily here.
  const measure = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return
      const observer = getObserver()
      observer.observe(el)
      return () => observer.unobserve(el)
    },
    [getObserver]
  )

  const columnCount = width ? columnsFor(width) : 1
  const columnWidth = width
    ? (width - GAP * (columnCount - 1)) / columnCount
    : 0
  const columnHeights = new Array<number>(columnCount).fill(0)
  const positioned = items.map((item) => {
    let shortest = 0
    for (let c = 1; c < columnCount; c++)
      if (columnHeights[c]! < columnHeights[shortest]!) shortest = c
    const key = getKey(item)
    const top = columnHeights[shortest]!
    columnHeights[shortest]! += (heights.get(key) ?? ESTIMATED_HEIGHT) + GAP
    return { item, key, top, left: shortest * (columnWidth + GAP) }
  })
  const totalHeight = Math.max(0, ...columnHeights) - GAP

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: Math.max(totalHeight, 0) }}
    >
      {positioned.map(({ item, key, top, left }) => (
        <div
          key={key}
          data-key={key}
          ref={measure}
          className="absolute"
          style={{ top, left, width: columnWidth || "100%" }}
        >
          {renderItem(item)}
        </div>
      ))}
    </div>
  )
}
