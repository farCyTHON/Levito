import { collectionGet, collectionPost } from "@/lib/server/api";

export const GET = collectionGet("initiatives");
export const POST = collectionPost("initiatives");
