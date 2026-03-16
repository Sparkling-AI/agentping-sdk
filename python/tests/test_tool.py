"""Tests for tool_definition() and handle_tool_call()."""

from unittest.mock import MagicMock, patch

from agentping.client import AgentPingClient
from agentping.tool import handle_tool_call, tool_definition


class TestToolDefinition:
    def test_has_function_type(self):
        td = tool_definition()
        assert td["type"] == "function"

    def test_function_name(self):
        td = tool_definition()
        assert td["function"]["name"] == "agentping_alert"

    def test_has_description(self):
        td = tool_definition()
        assert len(td["function"]["description"]) > 10

    def test_parameters_is_object(self):
        td = tool_definition()
        params = td["function"]["parameters"]
        assert params["type"] == "object"

    def test_required_fields(self):
        td = tool_definition()
        required = td["function"]["parameters"]["required"]
        assert "title" in required
        assert "severity" in required
        assert len(required) == 2

    def test_severity_enum(self):
        td = tool_definition()
        sev = td["function"]["parameters"]["properties"]["severity"]
        assert set(sev["enum"]) == {
            "normal", "critical", "persistent_critical", "low", "urgent",
        }

    def test_normal_is_first_severity(self):
        td = tool_definition()
        sev = td["function"]["parameters"]["properties"]["severity"]
        assert sev["enum"][0] == "normal"

    def test_alert_type_enum(self):
        td = tool_definition()
        at = td["function"]["parameters"]["properties"]["alert_type"]
        assert set(at["enum"]) == {
            "approval", "task_failure", "threshold", "reminder", "other",
        }

    def test_all_optional_properties_present(self):
        td = tool_definition()
        props = td["function"]["parameters"]["properties"]
        for key in ("title", "severity", "message", "alert_type",
                     "delay_seconds", "expires_in_minutes", "metadata"):
            assert key in props, f"Missing property: {key}"

    def test_delay_seconds_range(self):
        td = tool_definition()
        ds = td["function"]["parameters"]["properties"]["delay_seconds"]
        assert ds["minimum"] == 0
        assert ds["maximum"] == 3600

    def test_expires_in_minutes_range(self):
        td = tool_definition()
        eim = td["function"]["parameters"]["properties"]["expires_in_minutes"]
        assert eim["minimum"] == 1
        assert eim["maximum"] == 1440


class TestHandleToolCall:
    @patch.object(AgentPingClient, "send_alert")
    def test_passes_required_args(self, mock_send):
        mock_send.return_value = {"id": "a-1", "status": "escalating_sms"}
        client = MagicMock(spec=AgentPingClient)
        client.send_alert = mock_send

        result = handle_tool_call(client, {
            "title": "Server down",
            "severity": "critical",
        })

        mock_send.assert_called_once_with(
            title="Server down",
            severity="critical",
            message=None,
            alert_type=None,
            delay_seconds=None,
            expires_in_minutes=None,
            metadata=None,
        )
        assert result["id"] == "a-1"

    @patch.object(AgentPingClient, "send_alert")
    def test_passes_all_args(self, mock_send):
        mock_send.return_value = {"id": "a-2"}
        client = MagicMock(spec=AgentPingClient)
        client.send_alert = mock_send

        handle_tool_call(client, {
            "title": "Need approval",
            "severity": "urgent",
            "message": "Deploy ready",
            "alert_type": "approval",
            "delay_seconds": 300,
            "expires_in_minutes": 30,
            "metadata": {"version": "2.0"},
        })

        mock_send.assert_called_once_with(
            title="Need approval",
            severity="urgent",
            message="Deploy ready",
            alert_type="approval",
            delay_seconds=300,
            expires_in_minutes=30,
            metadata={"version": "2.0"},
        )

    @patch.object(AgentPingClient, "send_alert")
    def test_returns_api_response(self, mock_send):
        expected = {"id": "a-3", "status": "waiting_for_primary_ack"}
        mock_send.return_value = expected
        client = MagicMock(spec=AgentPingClient)
        client.send_alert = mock_send

        result = handle_tool_call(client, {"title": "T", "severity": "low"})
        assert result == expected
