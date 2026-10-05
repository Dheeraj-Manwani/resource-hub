"use client"

import {
  CircleHelpIcon,
  HeartIcon,
  LogOutIcon,
  SettingsIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "react-hot-toast"
import { useSyncController } from "@/components/sync-provider"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { signOut } from "@/lib/auth-client"

import { useShell } from "./shell-context"

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}

export function UserMenu() {
  const { user, openTour } = useShell()
  const router = useRouter()
  const sync = useSyncController()
  const queryClient = useQueryClient()

  async function logout() {
    const result = await signOut()
    if (result.error) {
      toast.error("Couldn't log out. Try again.")
      return
    }
    sync.reset()
    queryClient.clear()
    router.replace("/")
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Account menu"
          />
        }
      >
        <Avatar size="sm">
          {user.image ? (
            <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />
          ) : null}
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
            <span className="truncate text-sm font-medium text-foreground">
              {user.name}
            </span>
            <span className="truncate text-xs font-normal text-text-muted">
              {user.email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <SettingsIcon />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={openTour}>
          <CircleHelpIcon />
          Take a tour
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <a
              href="https://buymeacoffee.com/madfortech"
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          <HeartIcon />
          Support Resource Hub
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>
          <LogOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
