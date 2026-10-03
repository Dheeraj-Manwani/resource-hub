"use client"

const loaded = new Map<string, Promise<void>>()

/** Loads a third-party script once per page (one loader per platform). */
export function loadScript(src: string): Promise<void> {
  const existing = loaded.get(src)
  if (existing) return existing
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = src
    script.async = true
    script.charset = "utf-8"
    script.onload = () => resolve()
    script.onerror = () => {
      loaded.delete(src)
      reject(new Error(`Failed to load ${src}`))
    }
    document.body.appendChild(script)
  })
  loaded.set(src, promise)
  return promise
}
