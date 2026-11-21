import { itemDelete, itemGet, itemPatch } from "@/lib/server/api";

export const GET = itemGet("initiatives");
export const PATCH = itemPatch("initiatives");
export const DELETE = itemDelete("initiatives");
