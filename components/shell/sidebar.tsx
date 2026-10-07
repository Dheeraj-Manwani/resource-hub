"use client"

import { SettingsIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense } from "react"

import { ProjectsSidebarSection } from "@/components/projects/sidebar-tree"
import { TasksSmartFiltersSection } from "@/components/tasks/smart-filters-sidebar"
import { Logo } from "@/components/logo"
import { cn } from "@/lib/utils"

import { NAV_ITEMS } from "./nav-config"
import { SyncStatus } from "./sync-status"

export function SidebarContent({
  onNavigate,
  draggable = false,
}: {
  onNavigate?: () => void
  draggable?: boolean
}) {
  const pathname = usePathname()
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/overview" onClick={onNavigate} className="rounded-md">
          <Logo />
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                    data-tour={`tour-nav-${href.slice(1)}`}
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

        <Suspense fallback={null}>
          <TasksSmartFiltersSection />
        </Suspense>
        <ProjectsSidebarSection draggable={draggable} />
      </div>

      <div className="flex shrink-0 flex-col gap-0.5 p-2">
        <SyncStatus />
        <div className="mt-auto flex flex-col gap-0.5 border-t border-sidebar-border p-2">
          <Link
            href="/trash"
            onClick={onNavigate}
            aria-current={isActive("/trash") ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-text-muted hover:bg-white/[0.04] hover:text-foreground",
              isActive("/trash") && "bg-brand-soft text-foreground"
            )}
          >
            <Trash2Icon className="size-4 text-subtle" />
            Trash
          </Link>
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
    </div>
  )
}
