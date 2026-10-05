"use client"

import { Suspense, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useSyncController } from "@/components/sync-provider"
import { SyncStatus } from "./sync-status"

import { QuickAddProjectDialog } from "@/components/projects/quick-add-project-dialog"
import { QuickAddNoteDialog } from "@/components/quick-notes/quick-add-note-dialog"
import { AddResourceDialog } from "@/components/resources/add-resource-dialog"
import { LightboxProvider } from "@/components/resources/lightbox/lightbox-provider"
import { ResourcePreviewProvider } from "@/components/resources/resource-preview-provider"
import { ProjectDndProvider } from "@/components/projects/project-dnd"
import { CommandPalette } from "@/components/search/command-palette"
import { AppTour } from "@/components/tour/app-tour"
import { TaskShortcuts } from "@/components/tasks/task-shortcuts"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import type { AppUser } from "@/lib/server/dal/session"

import { DetailDrawer } from "./detail-drawer"
import { MobileFab } from "./mobile-fab"
import { ShellProvider, useShell } from "./shell-context"
import { SidebarContent } from "./sidebar"
import { TopBar } from "./top-bar"

function MobileNav() {
  const { mobileNavOpen, setMobileNavOpen } = useShell()
  return (
    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <SheetContent
        side="left"
        className="w-72 border-sidebar-border bg-sidebar p-0 data-[side=left]:w-72"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

export function AppShell({
  user,
  children,
}: {
  user: AppUser
  children: React.ReactNode
}) {
  const sync = useSyncController()
  const queryClient = useQueryClient()
  useEffect(() => {
    if (sync.setSession(user.id)) queryClient.clear()
  }, [sync, queryClient, user.id])
  return (
    <ShellProvider user={user}>
      <LightboxProvider>
        <ResourcePreviewProvider>
          <ProjectDndProvider>
            <div className="flex min-h-svh">
              <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
                <SidebarContent draggable />
              </aside>
              <div className="flex min-w-0 flex-1 flex-col">
                <TopBar />
                <SyncStatus className="sticky top-14 z-20 border-b border-border bg-background px-3 md:hidden" />
                <main className="flex-1 px-4 pt-6 pb-28 md:px-8 md:pb-12">
                  {children}
                </main>
              </div>
            </div>
            <MobileNav />
            <MobileFab />
            <AppTour />
            <QuickAddProjectDialog />
            <QuickAddNoteDialog />
            <Suspense>
              <AddResourceDialog />
              <DetailDrawer />
              <TaskShortcuts />
              <CommandPalette />
            </Suspense>
          </ProjectDndProvider>
        </ResourcePreviewProvider>
      </LightboxProvider>
    </ShellProvider>
  )
}
