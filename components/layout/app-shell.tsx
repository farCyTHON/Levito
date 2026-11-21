"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace, useWorkspaceError } from "@/lib/hooks/use-workspace";
import { DemoBadge } from "./demo-badge";
import { isActive, type NavItem, PRIMARY_NAV, SECONDARY_NAV, titleFor } from "./nav";
import { ThemeToggle } from "./theme-toggle";

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string | null;
  onNavigate?: () => void;
}) {
  const workspace = useWorkspace();
  return (
    <ul className="space-y-0.5">
      {items.map(({ href, label, icon: Icon, count }) => {
        const active = isActive(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-sidebar-foreground/70 transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
              )}
            >
              <Icon aria-hidden className={cn("size-4 shrink-0", active ? "text-brand" : "opacity-70")} />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {count && workspace && (
                <span className="tabular text-xs text-sidebar-foreground/45">{count(workspace.data)}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ActiveNavLinks(props: { items: NavItem[]; onNavigate?: () => void }) {
  return <NavLinks {...props} pathname={usePathname()} />;
}

function Nav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavLinks items={items} pathname={null} />}>
      <ActiveNavLinks items={items} onNavigate={onNavigate} />
    </Suspense>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const workspace = useWorkspace();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-4">
        <span
          aria-hidden
          className="flex size-6 items-center justify-center rounded-md bg-foreground text-xs font-bold text-background"
        >
          L
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold tracking-tight">Levito</p>
        </div>
      </div>

      <div className="px-4 pt-1 pb-3">
        {workspace ? (
          <div className="rounded-md border border-sidebar-border px-2.5 py-2">
            <p className="truncate text-xs font-medium" title={workspace.data.organization.name}>
              {workspace.data.organization.name}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/55">{workspace.data.organization.term}</p>
          </div>
        ) : (
          <Skeleton className="h-[3.125rem] w-full" />
        )}
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2">
        <p className="px-2 pb-1.5 text-[0.6875rem] font-medium tracking-wide text-sidebar-foreground/45 uppercase">
          Workspace
        </p>
        <Nav items={PRIMARY_NAV} onNavigate={onNavigate} />
      </nav>

      <div className="space-y-2 border-t border-sidebar-border p-2">
        <nav aria-label="Secondary">
          <Nav items={SECONDARY_NAV} onNavigate={onNavigate} />
        </nav>
        <p className="px-2 pb-1 text-xs text-pretty text-sidebar-foreground/50">
          {workspace?.mode === "notion"
            ? "Connected to Notion. Changes are written to your workspace and confirmed by the API."
            : "Demo workspace. Sample data only — never written to Notion."}
        </p>
      </div>
    </div>
  );
}

function CurrentTitle() {
  return <>{titleFor(usePathname())}</>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const workspaceError = useWorkspaceError();

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <aside className="hidden w-58 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:block">
        <SidebarContent />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 gap-0 bg-sidebar p-0 text-sidebar-foreground" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Move between Levito workspace sections.</SheetDescription>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 md:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu aria-hidden />
          </Button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
            <Suspense fallback="Levito">
              <CurrentTitle />
            </Suspense>
          </p>
          <DemoBadge />
          <ThemeToggle />
        </header>
        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
          {workspaceError && (
            <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive md:px-8">
              Could not load workspace data: {workspaceError}
            </div>
          )}
          <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
