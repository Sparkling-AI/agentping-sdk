# AgentPing SDKs

Official client libraries for [AgentPing](https://agentping.me) — escalation alerts for AI agents via voice calls.

## SDKs & Integrations

| Package | Directory | Install |
|---------|-----------|---------|
| Python SDK | [`python/`](./python) | `pip install agentping` |
| TypeScript SDK | [`typescript/`](./typescript) | `npm install agentping` |
| OpenClaw Skill | [`openclaw/`](./openclaw) | `clawhub install agentping-phone-call-alerts` |
| Claude Code Skill | [`claude-code/`](./claude-code) | Copy `SKILL.md` to `~/.claude/skills/agentping/` |

## What's included

Each SDK provides:

- **API client** — `send_alert()`, `get_alert()`, `acknowledge()` wrapping the AgentPing REST API
- **Tool definition** — OpenAI function-calling format, compatible with any agent framework
- **Tool handler** — executes the tool call against the API, so you can drop it into your agent loop
- **Typed errors** — distinct exceptions for 401, 403, 404, 422, 429 responses

## Quick start

### Python

```python
from agentping import AgentPingClient

client = AgentPingClient(api_key="ap_sk_...")

alert = client.send_alert(
    title="Deploy approval needed",
    severity="normal",
    alert_type="approval",
)
```

### TypeScript

```typescript
import { AgentPingClient } from "agentping";

const client = new AgentPingClient({ apiKey: "ap_sk_..." });

const alert = await client.sendAlert({
  title: "Deploy approval needed",
  severity: "normal",
  alert_type: "approval",
});
```

## Agent framework integration

Both SDKs include helpers for plugging AgentPing into agent tool loops:

```python
# Python
from agentping import AgentPingClient, tool_definition, handle_tool_call

client = AgentPingClient(api_key="ap_sk_...")
tools = [tool_definition()]              # add to agent's tools list
result = handle_tool_call(client, args)  # route tool calls here
```

```typescript
// TypeScript
import { AgentPingClient, toolDefinition, handleToolCall } from "agentping";

const client = new AgentPingClient({ apiKey: "ap_sk_..." });
const tools = [toolDefinition()];
const result = await handleToolCall(client, args);
```

Works with OpenAI, Anthropic Claude, LangChain, and any framework that supports function-calling tools. See each SDK's README for detailed examples.

## OpenClaw Skill

The [`openclaw/`](./openclaw) directory contains an [OpenClaw](https://openclaw.ai) skill that can be installed from [ClawHub](https://clawhub.ai). It teaches the OpenClaw agent how to escalate alerts via AgentPing using the "chat first, escalate second" pattern.

Install it locally:
```bash
clawhub install agentping-phone-call-alerts
```

Or publish your own version:
```bash
clawhub publish ./openclaw --slug agentping-phone-call-alerts --version 1.0.4
```

## Claude Code Skill

The [`claude-code/`](./claude-code) directory contains a [Claude Code](https://claude.ai/code) skill that lets Claude call your phone via AgentPing when it needs your attention — e.g. "call me when it's done", "ping me if you need me".

Install by copying the skill to your Claude Code skills directory:
```bash
mkdir -p ~/.claude/skills/agentping
cp claude-code/SKILL.md ~/.claude/skills/agentping/SKILL.md
```

Set your API key so Claude can use it:
```bash
echo 'export AGENTPING_API_KEY="ap_sk_your_key_here"' >> ~/.zshrc
source ~/.zshrc
```

## Links

- [AgentPing](https://agentping.me)
- [API docs](https://agentping.me/docs)
- [ClawHub skill](https://clawhub.ai/skills/agentping-phone-call-alerts)
- [OpenClaw skill spec](https://github.com/agentping/agentping-sdk/blob/main/docs/openclaw-skill-spec.md)
