import { collectionGet, collectionPost } from "@/lib/server/api";

export const GET = collectionGet("decisions");
export const POST = collectionPost("decisions");
