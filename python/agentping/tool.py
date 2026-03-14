"""OpenAI-compatible tool definition and handler for AgentPing.

Plug this into any agent framework that supports OpenAI function-calling tools.

Usage::

    from agentping import AgentPingClient, tool_definition, handle_tool_call

    client = AgentPingClient(api_key="ap_sk_...")

    # 1. Add to your agent's tools list
    tools = [tool_definition()]

    # 2. When the agent makes a tool call, route it:
    result = handle_tool_call(client, tool_call.function.arguments)
"""

from __future__ import annotations

from typing import Any

from agentping.client import AgentPingClient


def tool_definition() -> dict[str, Any]:
    """Return the agentping_alert tool in OpenAI function-calling format."""
    return {
        "type": "function",
        "function": {
            "name": "agentping_alert",
            "description": (
                "Escalate an alert to the user via SMS and/or phone call through "
                "AgentPing. Use this when you need the user's attention and they "
                "haven't responded to your chat message. Always try messaging the "
                "user in chat first — use this tool as a fallback escalation path. "
                "Choose severity based on urgency: 'low' for SMS only, 'urgent' "
                "for SMS then call, 'critical' for immediate call, "
                "'persistent_critical' for repeated calls until acknowledged."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Short summary of what needs the user's attention. Max 500 characters.",
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["low", "urgent", "critical", "persistent_critical"],
                        "description": (
                            "How urgently the user needs to respond. "
                            "'low': SMS only. 'urgent': SMS, then phone call if not acknowledged. "
                            "'critical': immediate phone call. "
                            "'persistent_critical': repeated calls until acknowledged."
                        ),
                    },
                    "message": {
                        "type": "string",
                        "description": "Longer description with context. Included in SMS and voice call. Max 2000 characters.",
                    },
                    "alert_type": {
                        "type": "string",
                        "enum": [
                            "approval",
                            "task_failure",
                            "threshold",
                            "reminder",
                            "other",
                        ],
                        "description": (
                            "Category of alert. Determines default escalation timing. "
                            "'approval': 5 min delay. 'task_failure': 2 min delay. "
                            "'threshold': 10 min delay. 'reminder': 5 min delay. "
                            "'other': immediate."
                        ),
                    },
                    "delay_seconds": {
                        "type": "integer",
                        "description": (
                            "Seconds to wait before starting SMS/call delivery. "
                            "Gives the user time to see your chat message first. "
                            "If omitted, uses the default for the alert_type. Set to 0 for immediate."
                        ),
                        "minimum": 0,
                        "maximum": 3600,
                    },
                    "expires_in_minutes": {
                        "type": "integer",
                        "description": "Auto-expire the alert after this many minutes if not acknowledged.",
                        "minimum": 1,
                        "maximum": 1440,
                    },
                    "metadata": {
                        "type": "object",
                        "description": "Arbitrary key-value data stored with the alert for tracking context.",
                    },
                },
                "required": ["title", "severity"],
            },
        },
    }


def handle_tool_call(
    client: AgentPingClient,
    arguments: dict[str, Any],
) -> dict[str, Any]:
    """Execute an agentping_alert tool call and return the API response.

    Pass the parsed ``arguments`` dict from the tool call directly.
    Returns the alert object from the AgentPing API.
    """
    return client.send_alert(
        title=arguments["title"],
        severity=arguments["severity"],
        message=arguments.get("message"),
        alert_type=arguments.get("alert_type"),
        delay_seconds=arguments.get("delay_seconds"),
        expires_in_minutes=arguments.get("expires_in_minutes"),
        metadata=arguments.get("metadata"),
    )
