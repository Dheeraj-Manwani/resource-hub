type Document = Record<string, unknown>
export type NoteDraft = {
  revision: number
  phase: "dirty" | "saving" | "failed" | "saved"
  doc?: Document
  text?: string
}

/** Failed drafts survive drawer/editor unmounts, but never cross session resets. */
export class NoteDrafts {
  private entries = new Map<string, NoteDraft>()
  private listeners = new Set<() => void>()
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private sequence = 0
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  get = (key: string) => this.entries.get(key)
  edit(key: string, doc: Document, text: string) {
    this.entries.set(key, {
      revision: ++this.sequence,
      phase: "dirty",
      doc,
      text,
    })
    this.emit()
  }
  async save(
    key: string,
    save: (doc: Document, text: string) => Promise<void>
  ) {
    const draft = this.entries.get(key)
    if (!draft?.doc || draft.phase === "saved" || draft.phase === "saving")
      return
    this.entries.set(key, { ...draft, phase: "saving" })
    this.emit()
    try {
      await save(draft.doc, draft.text ?? "")
      if (this.entries.get(key)?.revision === draft.revision) {
        this.entries.set(key, { revision: draft.revision, phase: "saved" })
        this.emit()
        const timer = setTimeout(() => {
          this.timers.delete(timer)
          if (this.entries.get(key)?.revision === draft.revision)
            this.discard(key)
        }, 2_000)
        this.timers.add(timer)
      }
    } catch (error) {
      if (this.entries.get(key)?.revision === draft.revision) {
        this.entries.set(key, { ...draft, phase: "failed" })
        this.emit()
      }
      throw error
    }
  }
  discard(key: string) {
    this.entries.delete(key)
    this.emit()
  }
  reset() {
    this.timers.forEach(clearTimeout)
    this.timers.clear()
    this.entries.clear()
    this.emit()
  }
  private emit() {
    this.listeners.forEach((listener) => listener())
  }
}
