import Link from "next/link";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <ErrorState
        title="Page not found"
        description="There is nothing at this address. It may have been moved, or the link may be incomplete."
        action={
          <Button asChild>
            <Link href="/overview">Go to Overview</Link>
          </Button>
        }
      />
    </div>
  );
}
