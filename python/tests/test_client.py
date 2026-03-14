"""Tests for AgentPingClient — send_alert, get_alert, acknowledge, error mapping."""

from unittest.mock import MagicMock, patch

import httpx
import pytest

from agentping.client import AgentPingClient
from agentping.exceptions import (
    AgentPingError,
    AuthenticationError,
    ForbiddenError,
    NotFoundError,
    RateLimitError,
    ValidationError,
)


def _mock_response(status_code, json_data=None, text=""):
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.text = text
    if json_data is not None:
        resp.json.return_value = json_data
    else:
        resp.json.side_effect = Exception("No JSON")
    return resp


class TestSendAlert:
    @patch.object(httpx.Client, "post")
    def test_minimal_request(self, mock_post):
        mock_post.return_value = _mock_response(201, {
            "id": "a-1",
            "status": "escalating_sms",
            "severity": "low",
            "alert_type": "other",
            "title": "Hi",
            "created_at": "2026-03-14T12:00:00Z",
            "expires_at": "2026-03-14T13:00:00Z",
        })

        client = AgentPingClient(api_key="ap_sk_test")
        result = client.send_alert(title="Hi", severity="low")

        assert result["id"] == "a-1"
        assert result["status"] == "escalating_sms"
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args
        body = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        assert body["title"] == "Hi"
        assert body["severity"] == "low"
        assert "message" not in body
        client.close()

    @patch.object(httpx.Client, "post")
    def test_all_fields(self, mock_post):
        mock_post.return_value = _mock_response(201, {
            "id": "a-2",
            "status": "waiting_for_primary_ack",
            "severity": "urgent",
            "alert_type": "approval",
            "title": "Deploy?",
            "created_at": "2026-03-14T12:00:00Z",
            "expires_at": "2026-03-14T12:30:00Z",
        })

        client = AgentPingClient(api_key="ap_sk_test")
        result = client.send_alert(
            title="Deploy?",
            severity="urgent",
            message="v2.4.1 ready",
            alert_type="approval",
            delay_seconds=300,
            phone_number="+14155550123",
            expires_in_minutes=30,
            metadata={"version": "2.4.1"},
        )

        assert result["alert_type"] == "approval"
        body = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get("json")
        assert body["message"] == "v2.4.1 ready"
        assert body["alert_type"] == "approval"
        assert body["delay_seconds"] == 300
        assert body["phone_number"] == "+14155550123"
        assert body["expires_in_minutes"] == 30
        assert body["metadata"]["version"] == "2.4.1"
        client.close()

    @patch.object(httpx.Client, "post")
    def test_optional_fields_omitted(self, mock_post):
        """Optional fields not in body when None."""
        mock_post.return_value = _mock_response(201, {"id": "a-3"})
        client = AgentPingClient(api_key="k")
        client.send_alert(title="T", severity="low")
        body = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get("json")
        for key in ("message", "alert_type", "delay_seconds", "phone_number",
                     "expires_in_minutes", "metadata"):
            assert key not in body
        client.close()


class TestGetAlert:
    @patch.object(httpx.Client, "get")
    def test_success(self, mock_get):
        mock_get.return_value = _mock_response(200, {
            "id": "a-1",
            "status": "acknowledged",
            "severity": "urgent",
            "alert_type": "approval",
            "title": "T",
            "message": None,
            "acknowledged_at": "2026-03-14T12:05:00Z",
            "acknowledged_via": "api",
            "escalation_step": 0,
            "delay_seconds": 300,
            "expires_at": None,
            "created_at": "2026-03-14T12:00:00Z",
            "metadata": None,
            "deliveries": [],
        })

        client = AgentPingClient(api_key="k")
        result = client.get_alert("a-1")
        assert result["status"] == "acknowledged"
        mock_get.assert_called_once_with("/v1/alerts/a-1")
        client.close()


class TestAcknowledge:
    @patch.object(httpx.Client, "post")
    def test_default_source(self, mock_post):
        mock_post.return_value = _mock_response(200, {
            "status": "acknowledged",
            "acknowledged_at": "2026-03-14T12:05:00Z",
            "acknowledged_via": "api",
        })
        client = AgentPingClient(api_key="k")
        result = client.acknowledge("a-1")
        assert result["acknowledged_via"] == "api"
        body = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get("json")
        assert body["ack_source"] == "api"
        client.close()

    @patch.object(httpx.Client, "post")
    def test_custom_source(self, mock_post):
        mock_post.return_value = _mock_response(200, {
            "status": "acknowledged",
            "acknowledged_at": "2026-03-14T12:05:00Z",
            "acknowledged_via": "chat",
        })
        client = AgentPingClient(api_key="k")
        result = client.acknowledge("a-1", ack_source="chat")
        body = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get("json")
        assert body["ack_source"] == "chat"
        client.close()


class TestErrorMapping:
    @patch.object(httpx.Client, "post")
    def test_401_raises_authentication_error(self, mock_post):
        mock_post.return_value = _mock_response(401, {"detail": "Invalid API key"})
        client = AgentPingClient(api_key="bad")
        with pytest.raises(AuthenticationError) as exc_info:
            client.send_alert(title="T", severity="low")
        assert exc_info.value.status_code == 401
        assert "Invalid API key" in str(exc_info.value)
        client.close()

    @patch.object(httpx.Client, "post")
    def test_403_raises_forbidden_error(self, mock_post):
        mock_post.return_value = _mock_response(403, {"detail": "Trial expired"})
        client = AgentPingClient(api_key="k")
        with pytest.raises(ForbiddenError) as exc_info:
            client.send_alert(title="T", severity="low")
        assert exc_info.value.status_code == 403
        client.close()

    @patch.object(httpx.Client, "get")
    def test_404_raises_not_found_error(self, mock_get):
        mock_get.return_value = _mock_response(404, {"detail": "Alert not found"})
        client = AgentPingClient(api_key="k")
        with pytest.raises(NotFoundError) as exc_info:
            client.get_alert("nonexistent")
        assert exc_info.value.status_code == 404
        client.close()

    @patch.object(httpx.Client, "post")
    def test_422_raises_validation_error(self, mock_post):
        errors = [{"loc": ["body", "severity"], "msg": "Input should be..."}]
        mock_post.return_value = _mock_response(422, {"detail": errors})
        client = AgentPingClient(api_key="k")
        with pytest.raises(ValidationError) as exc_info:
            client.send_alert(title="T", severity="bad")
        assert exc_info.value.status_code == 422
        assert len(exc_info.value.errors) > 0
        client.close()

    @patch.object(httpx.Client, "post")
    def test_429_raises_rate_limit_error(self, mock_post):
        mock_post.return_value = _mock_response(429, {"detail": "Rate limit exceeded"})
        client = AgentPingClient(api_key="k")
        with pytest.raises(RateLimitError) as exc_info:
            client.send_alert(title="T", severity="low")
        assert exc_info.value.status_code == 429
        client.close()

    @patch.object(httpx.Client, "post")
    def test_500_raises_generic_error(self, mock_post):
        mock_post.return_value = _mock_response(500, {"detail": "Internal error"})
        client = AgentPingClient(api_key="k")
        with pytest.raises(AgentPingError) as exc_info:
            client.send_alert(title="T", severity="low")
        assert exc_info.value.status_code == 500
        client.close()


class TestContextManager:
    @patch.object(httpx.Client, "post")
    @patch.object(httpx.Client, "close")
    def test_with_statement(self, mock_close, mock_post):
        mock_post.return_value = _mock_response(201, {"id": "a-1"})
        with AgentPingClient(api_key="k") as c:
            c.send_alert(title="T", severity="low")
        mock_close.assert_called_once()

    def test_custom_base_url(self):
        client = AgentPingClient(api_key="k", base_url="http://localhost:8000/")
        assert client._base_url == "http://localhost:8000"
        client.close()

    def test_custom_timeout(self):
        client = AgentPingClient(api_key="k", timeout=5.0)
        assert client._client.timeout == httpx.Timeout(5.0)
        client.close()
