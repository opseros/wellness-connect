import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// Lazy so `next build` doesn't need a database connection.
export const GET = (req: Request) => toNextJsHandler(getAuth()).GET(req);
export const POST = (req: Request) => toNextJsHandler(getAuth()).POST(req);
