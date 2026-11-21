import { itemDelete, itemGet, itemPatch } from "@/lib/server/api";

export const GET = itemGet("decisions");
export const PATCH = itemPatch("decisions");
export const DELETE = itemDelete("decisions");
