import type { Metadata } from "next";
import { InitiativesView } from "@/components/initiatives/initiatives-view";

export const metadata: Metadata = { title: "Initiatives" };

export default function Page() {
  return <InitiativesView />;
}
