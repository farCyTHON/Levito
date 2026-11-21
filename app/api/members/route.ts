import { collectionGet, collectionPost } from "@/lib/server/api";

export const GET = collectionGet("members");
export const POST = collectionPost("members");
