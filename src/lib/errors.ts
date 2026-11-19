export class DeskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeskError";
  }
}

export class StockError extends DeskError {
  constructor(message: string) {
    super(message);
    this.name = "StockError";
  }
}

export class ScopeError extends DeskError {
  constructor(message = "That belongs to a different client.") {
    super(message);
    this.name = "ScopeError";
  }
}

export class AuthError extends DeskError {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export function toUserError(error: unknown): string {
  if (error instanceof DeskError) return error.message;
  if (error instanceof Error && error.name === "ZodError") {
    const issues = (error as { issues?: { message?: string }[] }).issues;
    return issues?.[0]?.message ?? "Check the form and try again.";
  }
  console.error(error);
  return "Something went wrong. Try again.";
}
