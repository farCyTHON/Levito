import type { LucideIcon } from "lucide-react";
import { CircleAlert } from "lucide-react";
import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-pretty text-muted-foreground">{description}</p>
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-destructive/12 text-destructive">
        <CircleAlert className="size-4" aria-hidden />
      </div>
      <h1 className="text-base font-medium">{title}</h1>
      <p className="mt-1 text-sm text-pretty text-muted-foreground">{description}</p>
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

function SkeletonHeader() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-6 w-44" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="divide-y rounded-lg border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="hidden h-5 w-16 sm:block" />
          <Skeleton className="hidden h-5 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ variant = "list" }: { variant?: "list" | "overview" | "detail" }) {
  return (
    <div role="status" aria-label="Loading" className="animate-in fade-in duration-300">
      <SkeletonHeader />
      {variant === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <Skeleton className="h-56 rounded-lg" />
            <Skeleton className="h-56 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          <SkeletonRows rows={4} />
        </div>
      )}
      {variant === "list" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="hidden h-8 w-28 sm:block" />
          </div>
          <SkeletonRows rows={6} />
        </div>
      )}
      {variant === "detail" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-6">
            <Skeleton className="h-28 rounded-lg" />
            <SkeletonRows rows={4} />
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      )}
      <span className="sr-only">Loading workspace…</span>
    </div>
  );
}
