import { itemDelete, itemGet, itemPatch } from "@/lib/server/api";

export const GET = itemGet("members");
export const PATCH = itemPatch("members");
export const DELETE = itemDelete("members");
