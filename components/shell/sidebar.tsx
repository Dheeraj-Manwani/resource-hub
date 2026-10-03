"use client"

import { FolderTreeIcon, PlusIcon, SettingsIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { NAV_ITEMS } from "./nav-config"

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Link href="/library" onClick={onNavigate} className="rounded-md">
          <Logo />
        </Link>
      </div>

      <nav aria-label="Main" className="px-2 pt-2">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-text-muted transition-colors hover:bg-white/[0.04] hover:text-foreground",
                    active &&
                      "bg-brand-soft text-foreground hover:bg-brand-soft"
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-brand"
                    />
                  ) : null}
                  <Icon
                    className={cn(
                      "size-4",
                      active
                        ? "text-brand"
                        : "text-subtle group-hover:text-text-muted"
                    )}
                  />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="mt-6 px-2">
        <div className="flex items-center justify-between px-3 pb-1">
          <span className="text-[11px] font-medium tracking-wider text-subtle uppercase">
            Projects
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="New project"
                  disabled
                />
              }
            >
              <PlusIcon />
            </TooltipTrigger>
            <TooltipContent>Projects arrive in Phase 3</TooltipContent>
          </Tooltip>
        </div>
        <div className="mx-1 mt-1 flex items-start gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-subtle">
          <FolderTreeIcon className="mt-0.5 size-3.5 shrink-0" />
          Nested projects will live here.
        </div>
      </div>

      <div className="mt-auto border-t border-sidebar-border p-2">
        <Link
          href="/settings"
          onClick={onNavigate}
          aria-current={isActive("/settings") ? "page" : undefined}
          className={cn(
            "flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-text-muted hover:bg-white/[0.04] hover:text-foreground",
            isActive("/settings") && "bg-brand-soft text-foreground"
          )}
        >
          <SettingsIcon className="size-4 text-subtle" />
          Settings
        </Link>
      </div>
    </div>
  )
}
