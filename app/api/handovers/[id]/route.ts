import { itemDelete, itemGet, itemPatch } from "@/lib/server/api";

export const GET = itemGet("handovers");
export const PATCH = itemPatch("handovers");
export const DELETE = itemDelete("handovers");
