import { itemDelete, itemGet, itemPatch } from "@/lib/server/api";

export const GET = itemGet("actions");
export const PATCH = itemPatch("actions");
export const DELETE = itemDelete("actions");
