"""AgentPing API client."""

from __future__ import annotations

from typing import Any, Literal

import httpx

from agentping.exceptions import (
    AgentPingError,
    AuthenticationError,
    ForbiddenError,
    NotFoundError,
    RateLimitError,
    ValidationError,
)

Severity = Literal[
    "normal",
    "critical",
    "persistent_critical",
    "low",    # deprecated — mapped to "normal" by the API
    "urgent",  # deprecated — mapped to "normal" by the API
]
AlertType = Literal["approval", "task_failure", "threshold", "reminder", "other"]
AckSource = Literal["dtmf", "sms_link", "sms_reply", "api", "chat", "manual"]

DEFAULT_BASE_URL = "https://api.agentping.me"


class AgentPingClient:
    """Thin client for the AgentPing alert API.

    Usage::

        from agentping import AgentPingClient

        client = AgentPingClient(api_key="ap_sk_...")
        alert = client.send_alert(
            title="Deploy approval needed",
            severity="normal",
            alert_type="approval",
        )
        print(alert["id"], alert["status"])

    """

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self._base_url,
            headers={
                "X-API-Key": self._api_key,
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )

    # ── Public API ──────────────────────────────────────────────

    def send_alert(
        self,
        *,
        title: str,
        severity: Severity,
        message: str | None = None,
        alert_type: AlertType | None = None,
        delay_seconds: int | None = None,
        phone_number: str | None = None,
        expires_in_minutes: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Create an alert. Returns the created alert object."""
        body: dict[str, Any] = {"title": title, "severity": severity}
        if message is not None:
            body["message"] = message
        if alert_type is not None:
            body["alert_type"] = alert_type
        if delay_seconds is not None:
            body["delay_seconds"] = delay_seconds
        if phone_number is not None:
            body["phone_number"] = phone_number
        if expires_in_minutes is not None:
            body["expires_in_minutes"] = expires_in_minutes
        if metadata is not None:
            body["metadata"] = metadata

        resp = self._client.post("/v1/alerts", json=body)
        return self._handle_response(resp)

    def get_alert(self, alert_id: str) -> dict[str, Any]:
        """Get alert status and delivery details."""
        resp = self._client.get(f"/v1/alerts/{alert_id}")
        return self._handle_response(resp)

    def acknowledge(
        self,
        alert_id: str,
        *,
        ack_source: AckSource = "api",
    ) -> dict[str, Any]:
        """Acknowledge an alert to stop escalation."""
        resp = self._client.post(
            f"/v1/alerts/{alert_id}/acknowledge",
            json={"ack_source": ack_source},
        )
        return self._handle_response(resp)

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()

    def __enter__(self) -> AgentPingClient:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    # ── Internals ───────────────────────────────────────────────

    def _handle_response(self, resp: httpx.Response) -> dict[str, Any]:
        if resp.status_code in (200, 201):
            return resp.json()

        detail = ""
        try:
            body = resp.json()
            detail = body.get("detail", str(body))
        except Exception:
            detail = resp.text

        if resp.status_code == 401:
            raise AuthenticationError(str(detail), status_code=401)
        if resp.status_code == 403:
            raise ForbiddenError(str(detail), status_code=403)
        if resp.status_code == 404:
            raise NotFoundError(str(detail), status_code=404)
        if resp.status_code == 422:
            errors = detail if isinstance(detail, list) else []
            raise ValidationError(str(detail), errors=errors)
        if resp.status_code == 429:
            raise RateLimitError(str(detail), status_code=429)
        raise AgentPingError(str(detail), status_code=resp.status_code)
