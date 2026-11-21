"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="This page could not be displayed"
      description="Something went wrong while rendering this view. Your demo data has not been changed. Try again, or return to the overview."
      action={
        <>
          <Button onClick={() => retry()}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/overview">Go to Overview</Link>
          </Button>
        </>
      }
    />
  );
}
