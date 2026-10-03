"use client"

import { ListPlusIcon, MenuIcon, PlusIcon, SearchIcon } from "lucide-react"
import Link from "next/link"

import { RemindersBell } from "@/components/calendar/reminders-bell"
import { LogoMark } from "@/components/logo"
import { Button } from "@/components/ui/button"

import { useShell } from "./shell-context"
import { UserMenu } from "./user-menu"

export function TopBar() {
  const { openAddResource, openAddTask, setMobileNavOpen, setCommandPaletteOpen } = useShell()

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-md md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation"
        onClick={() => setMobileNavOpen(true)}
      >
        <MenuIcon />
      </Button>
      <Link href="/overview" className="md:hidden" aria-label="Overview">
        <LogoMark className="size-6" />
      </Link>

      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        className="ml-auto flex h-9 w-full max-w-[11rem] items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-subtle transition-colors hover:border-border-strong hover:text-text-muted sm:max-w-xs md:mr-auto md:ml-0 md:max-w-sm"
      >
        <SearchIcon className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">Search everything…</span>
        <kbd className="hidden rounded border border-border-strong px-1 text-[10px] text-subtle sm:inline">
          ⌘K
        </kbd>
      </button>

      <div className="hidden items-center gap-2 md:flex">
        <Button variant="outline" onClick={() => openAddTask()}>
          <ListPlusIcon />
          Add task
        </Button>
        <Button
          onClick={() => openAddResource()}
          className="hover:bg-brand-hover hover:shadow-glow"
        >
          <PlusIcon />
          Add resource
        </Button>
      </div>
      <RemindersBell />
      <UserMenu />
    </header>
  )
}
