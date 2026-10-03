import {
  CalendarDaysIcon,
  LayoutDashboardIcon,
  LibraryBigIcon,
  ListTodoIcon,
  SearchIcon,
  TagIcon,
  type LucideIcon,
} from "lucide-react"

export type NavItem = { href: string; label: string; icon: LucideIcon }

export const NAV_ITEMS: NavItem[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/resources", label: "Resources", icon: LibraryBigIcon },
  { href: "/tasks", label: "Tasks", icon: ListTodoIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarDaysIcon },
  { href: "/search", label: "Search", icon: SearchIcon },
  { href: "/tags", label: "Tags", icon: TagIcon },
]
