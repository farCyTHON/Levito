import { toast } from "sonner";
import type { WriteReceipt } from "@/lib/repositories";

function describe(receipt: WriteReceipt): string {
  if (receipt.target === "demo-session") return "Saved to this demo session only. Nothing was written to Notion.";
  return receipt.confirmed ? "Saved to Notion." : "Notion has not confirmed this change yet.";
}

export function notifySaved(title: string, receipt: WriteReceipt) {
  toast.success(title, { description: describe(receipt) });
}

export function notifyError(title: string, description?: string) {
  toast.error(title, { description });
}
