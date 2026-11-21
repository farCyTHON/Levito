import type { Metadata } from "next";
import { KnowledgeView } from "@/components/knowledge/knowledge-view";

export const metadata: Metadata = { title: "Knowledge Library" };

export default function Page() {
  return <KnowledgeView />;
}
