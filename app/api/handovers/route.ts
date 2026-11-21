import { collectionGet, collectionPost } from "@/lib/server/api";

export const GET = collectionGet("handovers");
export const POST = collectionPost("handovers");
