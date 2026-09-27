/**
 * Errors that are safe to show to users. Anything else is logged and replaced with a generic message,
 * so internal details (SQL, secrets, stack traces) never reach the browser.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string = "BAD_REQUEST",
    public status: number = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super(message, "UNAUTHENTICATED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, "FORBIDDEN", 403);
  }
}

export class StockError extends AppError {
  constructor(message = "Some items are no longer available in the quantity requested.") {
    super(message, "INSUFFICIENT_STOCK", 409);
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[] | undefined> };

export function publicMessage(err: unknown): { error: string; code?: string; status: number } {
  if (err instanceof AppError) return { error: err.message, code: err.code, status: err.status };
  if (typeof err === "object" && err && "issues" in err) {
    return { error: "Please check the highlighted fields.", code: "VALIDATION", status: 422 };
  }
  console.error("[unexpected-error]", err);
  return { error: "Something went wrong. Please try again.", code: "INTERNAL", status: 500 };
}

/** Wraps a server action body, converting thrown errors into a safe ActionResult. */
export async function safeAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (err) {
    // Next.js redirect()/notFound() throw special errors that must propagate.
    if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string") {
      const digest = (err as { digest: string }).digest;
      if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND") || digest.startsWith("NEXT_HTTP_ERROR")) throw err;
    }
    if (typeof err === "object" && err && "issues" in err && Array.isArray((err as { issues: unknown[] }).issues)) {
      const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
      const fieldErrors: Record<string, string[]> = {};
      for (const i of issues) {
        const k = String(i.path[0] ?? "form");
        (fieldErrors[k] ??= []).push(i.message);
      }
      return { ok: false, error: issues[0]?.message ?? "Please check the form.", code: "VALIDATION", fieldErrors };
    }
    const { error, code } = publicMessage(err);
    return { ok: false, error, code };
  }
}
