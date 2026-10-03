"use client"

import dynamic from "next/dynamic"
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import type { ResourceDto } from "@/lib/resources/dto"
import { displayTitle } from "@/lib/resources/dto"

import type { LightboxSlide } from "./lightbox-impl"

const LightboxImpl = dynamic(() => import("./lightbox-impl"), { ssr: false })

type LightboxContextValue = {
  /** Opens the viewer on `startId`, with next/prev over the image resources in `list`. */
  openImages: (list: ResourceDto[], startId: string) => void
}

const LightboxContext = createContext<LightboxContextValue | null>(null)

function toSlide(r: ResourceDto): LightboxSlide | null {
  const src = r.file?.url ?? r.thumbnailUrl
  if (!src) return null
  return {
    src,
    title: displayTitle(r),
    description: r.notes ?? undefined,
    width: r.file?.width ?? r.metadata.imageWidth,
    height: r.file?.height ?? r.metadata.imageHeight,
  }
}

export function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    slides: LightboxSlide[]
    index: number
  } | null>(null)

  const openImages = useCallback((list: ResourceDto[], startId: string) => {
    const images = list.filter((r) => r.type === "image")
    const slides: LightboxSlide[] = []
    let index = 0
    for (const r of images) {
      const slide = toSlide(r)
      if (!slide) continue
      if (r.id === startId) index = slides.length
      slides.push(slide)
    }
    if (slides.length) setState({ slides, index })
  }, [])

  const value = useMemo(() => ({ openImages }), [openImages])
  return (
    <LightboxContext.Provider value={value}>
      {children}
      {state ? (
        <LightboxImpl
          slides={state.slides}
          index={state.index}
          onClose={() => setState(null)}
          onIndexChange={(index) => setState((s) => (s ? { ...s, index } : s))}
        />
      ) : null}
    </LightboxContext.Provider>
  )
}

export function useLightbox() {
  const ctx = useContext(LightboxContext)
  if (!ctx)
    throw new Error("useLightbox must be used inside <LightboxProvider>")
  return ctx
}
