import { BookOpen, GitBranch, LayoutDashboard, type LucideIcon, Repeat2, Rocket, Settings } from "lucide-react";
import type { WorkspaceData } from "@/domain/models";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: (data: WorkspaceData) => number;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  {
    href: "/initiatives",
    label: "Initiatives",
    icon: Rocket,
    count: (d) => d.initiatives.filter((i) => i.status !== "completed").length,
  },
  { href: "/knowledge", label: "Knowledge Library", icon: BookOpen, count: (d) => d.knowledge.length },
  { href: "/decisions", label: "Decision Log", icon: GitBranch, count: (d) => d.decisions.length },
  { href: "/handovers", label: "Handover Center", icon: Repeat2, count: (d) => d.handovers.length },
];

export const SECONDARY_NAV: NavItem[] = [{ href: "/settings", label: "Settings", icon: Settings }];

export function isActive(pathname: string | null, href: string): boolean {
  return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}

export function titleFor(pathname: string | null): string {
  return [...PRIMARY_NAV, ...SECONDARY_NAV].find((item) => isActive(pathname, item.href))?.label ?? "Levito";
}
