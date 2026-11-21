import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/states";
import { InitiativeDetailView } from "@/components/initiatives/initiative-detail-view";

export const metadata: Metadata = { title: "Initiative" };

export default function Page({ params }: PageProps<"/initiatives/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      {params.then(({ id }) => (
        <InitiativeDetailView id={id} />
      ))}
    </Suspense>
  );
}
