# AgentPing Python SDK

Official Python SDK for [AgentPing](https://agentping.me) — escalation alerts for AI agents via SMS and voice calls.

## Install

```bash
pip install agentping
```

## Quick start

```python
from agentping import AgentPingClient

client = AgentPingClient(api_key="ap_sk_...")

# Send an alert
alert = client.send_alert(
    title="Deploy approval needed",
    severity="urgent",
    message="v2.4.1 ready for production. 3 migrations pending.",
    alert_type="approval",
    delay_seconds=300,
)

print(alert["id"])       # "550e8400-..."
print(alert["status"])   # "waiting_for_primary_ack"

# Check status later
status = client.get_alert(alert["id"])
print(status["status"])  # "acknowledged", "escalating_sms", etc.

# Acknowledge programmatically (stops escalation)
ack = client.acknowledge(alert["id"])
print(ack["status"])     # "acknowledged"
```

## Agent framework integration

The SDK includes an OpenAI-compatible tool definition you can plug into any agent framework:

```python
from agentping import AgentPingClient, tool_definition, handle_tool_call

client = AgentPingClient(api_key="ap_sk_...")

# 1. Add to your agent's tools
tools = [tool_definition()]

# 2. When the agent calls the tool, handle it:
# (assuming `tool_call` is the parsed tool call from your framework)
import json

args = json.loads(tool_call.function.arguments)
result = handle_tool_call(client, args)
```

### OpenAI example

```python
from openai import OpenAI
from agentping import AgentPingClient, tool_definition, handle_tool_call
import json

openai = OpenAI()
agentping = AgentPingClient(api_key="ap_sk_...")

messages = [
    {"role": "system", "content": """You are a helpful assistant.
When you need the user's attention and they haven't responded to your message,
use the agentping_alert tool to escalate via SMS/call.
Always try messaging in chat first — use agentping_alert as a fallback."""},
    {"role": "user", "content": "Monitor my deploy and alert me if it fails."},
]

response = openai.chat.completions.create(
    model="gpt-4o",
    messages=messages,
    tools=[tool_definition()],
)

# Handle tool calls
for tool_call in response.choices[0].message.tool_calls or []:
    if tool_call.function.name == "agentping_alert":
        args = json.loads(tool_call.function.arguments)
        result = handle_tool_call(agentping, args)
        print(f"Alert sent: {result['id']}")
```

### Anthropic Claude example

```python
from anthropic import Anthropic
from agentping import AgentPingClient, tool_definition, handle_tool_call
import json

anthropic = Anthropic()
agentping = AgentPingClient(api_key="ap_sk_...")

# Convert OpenAI tool format to Anthropic format
openai_tool = tool_definition()
anthropic_tool = {
    "name": openai_tool["function"]["name"],
    "description": openai_tool["function"]["description"],
    "input_schema": openai_tool["function"]["parameters"],
}

response = anthropic.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    system="""You are a helpful assistant.
When you need the user's attention and they haven't responded,
use the agentping_alert tool to escalate via SMS/call.""",
    messages=[{"role": "user", "content": "Monitor my deploy and alert me if it fails."}],
    tools=[anthropic_tool],
)

# Handle tool use
for block in response.content:
    if block.type == "tool_use" and block.name == "agentping_alert":
        result = handle_tool_call(agentping, block.input)
        print(f"Alert sent: {result['id']}")
```

## Severity levels

| Severity | Delivery | Behavior |
|----------|----------|----------|
| `low` | SMS only | Single text, no follow-up |
| `urgent` | SMS → Call | SMS first, call after 5 min if not acked |
| `critical` | Immediate call | Phone call right away, retries after 3 min |
| `persistent_critical` | Repeated calls | Calls every 2 min until acked or limit hit |

## Alert types

| Type | Default Delay | Use when |
|------|---------------|----------|
| `approval` | 300s (5 min) | Agent needs a decision |
| `task_failure` | 120s (2 min) | Something broke |
| `threshold` | 600s (10 min) | Metric crossed a boundary |
| `reminder` | 300s (5 min) | Time-sensitive nudge |
| `other` | 0s (immediate) | General escalation |

## Error handling

```python
from agentping import AgentPingClient, RateLimitError, ForbiddenError

client = AgentPingClient(api_key="ap_sk_...")

try:
    client.send_alert(title="Test", severity="low")
except RateLimitError:
    print("Too many alerts — wait before retrying")
except ForbiddenError as e:
    print(f"Policy violation: {e}")
```

## API reference

- `AgentPingClient(api_key, base_url=..., timeout=30.0)` — create a client
- `client.send_alert(title, severity, message=..., alert_type=..., delay_seconds=..., phone_number=..., expires_in_minutes=..., metadata=...)` — create an alert
- `client.get_alert(alert_id)` — get alert status
- `client.acknowledge(alert_id, ack_source="api")` — acknowledge an alert
- `client.close()` — close the HTTP client (also works as a context manager)

## Links

- [AgentPing docs](https://agentping.me/docs)
- [API reference](https://agentping.me/docs)
- [GitHub](https://github.com/agentping/agentping-sdk/tree/main/python)
