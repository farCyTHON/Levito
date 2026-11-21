import { itemDelete, itemGet, itemPatch } from "@/lib/server/api";

export const GET = itemGet("knowledge");
export const PATCH = itemPatch("knowledge");
export const DELETE = itemDelete("knowledge");
