"use client"

import { Suspense } from "react"

import { AddResourceDialog } from "@/components/resources/add-resource-dialog"
import { LightboxProvider } from "@/components/resources/lightbox/lightbox-provider"
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
  return (
    <ShellProvider user={user}>
      <LightboxProvider>
        <div className="flex min-h-svh">
          <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
            <SidebarContent />
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main className="flex-1 px-4 pt-6 pb-28 md:px-8 md:pb-12">
              {children}
            </main>
          </div>
        </div>
        <MobileNav />
        <MobileFab />
        <Suspense>
          <AddResourceDialog />
          <DetailDrawer />
        </Suspense>
      </LightboxProvider>
    </ShellProvider>
  )
}
