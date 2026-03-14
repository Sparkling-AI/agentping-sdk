"""Custom exceptions for the AgentPing SDK."""

from __future__ import annotations


class AgentPingError(Exception):
    """Base exception for all AgentPing errors."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class AuthenticationError(AgentPingError):
    """Raised on 401 — missing, invalid, or revoked API key."""


class ForbiddenError(AgentPingError):
    """Raised on 403 — policy violation, trial expired, or quota exceeded."""


class NotFoundError(AgentPingError):
    """Raised on 404 — alert not found or does not belong to user."""


class ValidationError(AgentPingError):
    """Raised on 422 — invalid request body."""

    def __init__(self, message: str, errors: list[dict] | None = None) -> None:
        super().__init__(message, status_code=422)
        self.errors = errors or []


class RateLimitError(AgentPingError):
    """Raised on 429 — hourly or per-key rate limit exceeded."""
