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
    const fail = () => {
      clearTimeout(timer)
      script.onload = null
      script.onerror = null
      script.remove()
      loaded.delete(src)
      reject(new Error(`Failed to load ${src}`))
    }
    const timer = window.setTimeout(fail, 15_000)
    script.onload = () => {
      clearTimeout(timer)
      script.onload = null
      script.onerror = null
      resolve()
    }
    script.onerror = fail
    document.body.appendChild(script)
  })
  loaded.set(src, promise)
  return promise
}
