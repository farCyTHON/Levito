import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/states";
import { HandoverDetailView } from "@/components/handover/handover-detail-view";

export const metadata: Metadata = { title: "Handover" };

export default function Page({ params }: PageProps<"/handovers/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      {params.then(({ id }) => (
        <HandoverDetailView id={id} />
      ))}
    </Suspense>
  );
}
