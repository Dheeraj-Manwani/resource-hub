/** One shared queue bounds work across overlapping batches; rejection frees the slot. */
export class WorkQueue {
  private running = 0
  private waiting: (() => void)[] = []
  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1)
      throw new Error("Invalid concurrency limit")
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      const start = () => {
        this.running++
        resolve()
      }
      if (this.running < this.limit) start()
      else this.waiting.push(start)
    })
    try {
      return await work()
    } finally {
      this.running--
      this.waiting.shift()?.()
    }
  }
}
