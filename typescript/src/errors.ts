export class AgentPingError extends Error {
  public readonly statusCode: number | undefined;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "AgentPingError";
    this.statusCode = statusCode;
  }
}

export class AuthenticationError extends AgentPingError {
  constructor(message: string) {
    super(message, 401);
    this.name = "AuthenticationError";
  }
}

export class ForbiddenError extends AgentPingError {
  constructor(message: string) {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AgentPingError {
  constructor(message: string) {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AgentPingError {
  public readonly errors: Record<string, unknown>[];

  constructor(message: string, errors: Record<string, unknown>[] = []) {
    super(message, 422);
    this.name = "ValidationError";
    this.errors = errors;
  }
}

export class RateLimitError extends AgentPingError {
  constructor(message: string) {
    super(message, 429);
    this.name = "RateLimitError";
  }
}
