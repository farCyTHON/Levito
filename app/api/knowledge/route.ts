import { collectionGet, collectionPost } from "@/lib/server/api";

export const GET = collectionGet("knowledge");
export const POST = collectionPost("knowledge");
