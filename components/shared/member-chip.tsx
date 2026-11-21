import { cn } from "cn";
import type { ID, Member } from "@/domain/models";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function MemberChip({
  members,
  id,
  emptyLabel = "Unassigned",
  showRole = false,
  className,
}: {
  members: Member[];
  id: ID | null;
  emptyLabel?: string;
  showRole?: boolean;
  className?: string;
}) {
  const member = members.find((m) => m.id === id);
  if (!member) {
    return (
      <span className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <span aria-hidden className="size-5 shrink-0 rounded-full border border-dashed border-muted-foreground/50" />
        {id === null ? emptyLabel : "Unknown member"}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 text-sm", className)}>
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[0.6rem] font-medium text-secondary-foreground"
      >
        {initials(member.name)}
      </span>
      <span className="min-w-0 truncate">
        {member.name}
        {showRole && <span className="text-muted-foreground"> · {member.role}</span>}
        {!member.active && <span className="text-muted-foreground"> (inactive)</span>}
      </span>
    </span>
  );
}
