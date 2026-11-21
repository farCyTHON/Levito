import type { Metadata } from "next";
import { HandoversView } from "@/components/handover/handovers-view";

export const metadata: Metadata = { title: "Handover Center" };

export default function Page() {
  return <HandoversView />;
}
