import {
  CalendarDaysIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LibraryBigIcon,
  ListTodoIcon,
  SearchIcon,
  TagIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react"

export type NavItem = { href: string; label: string; icon: LucideIcon }

export const NAV_ITEMS: NavItem[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/library", label: "Library", icon: LibraryBigIcon },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/tasks", label: "Tasks", icon: ListTodoIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarDaysIcon },
  { href: "/search", label: "Search", icon: SearchIcon },
  { href: "/tags", label: "Tags", icon: TagIcon },
  { href: "/trash", label: "Trash", icon: Trash2Icon },
]
