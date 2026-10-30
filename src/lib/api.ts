import { ZodError } from "zod";
import { AppError } from "@/lib/errors";

/**
 * Wraps a Route Handler: consistent JSON errors ({ error: { code, message } })
 * and no stack traces leaking to clients.
 */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<unknown>) {
  return async (...args: Args): Promise<Response> => {
    try {
      const result = await fn(...args);
      if (result instanceof Response) return result;
      return Response.json({ data: result ?? null });
    } catch (err) {
      if (err instanceof AppError) {
        return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return Response.json({ error: { code: "invalid_input", message: "Check the highlighted fields", issues: err.issues } }, { status: 400 });
      }
      console.error(err);
      return Response.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
