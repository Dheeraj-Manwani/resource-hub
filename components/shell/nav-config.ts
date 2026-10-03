import {
  CalendarDaysIcon,
  InboxIcon,
  LibraryBigIcon,
  ListTodoIcon,
  SearchIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react"

export type NavItem = { href: string; label: string; icon: LucideIcon }

export const NAV_ITEMS: NavItem[] = [
  { href: "/library", label: "Library", icon: LibraryBigIcon },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/tasks", label: "Tasks", icon: ListTodoIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarDaysIcon },
  { href: "/search", label: "Search", icon: SearchIcon },
  { href: "/trash", label: "Trash", icon: Trash2Icon },
]
