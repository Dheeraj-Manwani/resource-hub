/** Reservations are made before onMutate, preserving user intent order across hooks. */
export class WriteCoordinator {
  private pending = new Set<WriteReservation>()

  reserve(keys: string[]) {
    const predecessors = [...this.pending].filter((job) =>
      overlaps(keys, job.keys)
    )
    let release!: () => void
    const done = new Promise<void>((resolve) => {
      release = resolve
    })
    const reservation: WriteReservation = {
      keys,
      done,
      waiting: predecessors.length > 0,
      cancelled: false,
      ready: Promise.all(predecessors.map((job) => job.done)).then(() => {
        reservation.waiting = false
      }),
      release: () => {
        this.pending.delete(reservation)
        release()
      },
    }
    this.pending.add(reservation)
    return reservation
  }

  reset() {
    for (const job of this.pending) {
      job.cancelled = true
      job.release()
    }
  }
}

export type WriteReservation = {
  keys: string[]
  ready: Promise<void>
  done: Promise<void>
  waiting: boolean
  cancelled: boolean
  release: () => void
}
export const overlaps = (left: string[], right: string[]) =>
  left.some((a) =>
    right.some(
      (b) =>
        a === b ||
        (a.split(":")[0] === b.split(":")[0] &&
          (a.endsWith(":all") || b.endsWith(":all")))
    )
  )
