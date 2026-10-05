"use client"

import { createContext } from "react"

/** Keep a virtual card mounted while a player or portalled menu owns it. */
export const MasonryRetention = createContext<
  ((source: string, active: boolean) => void) | null
>(null)
