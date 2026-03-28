# AgentPing TypeScript SDK

Official TypeScript/JavaScript SDK for [AgentPing](https://agentping.me) — phone call alerts when your AI agent needs you.

## Install

```bash
npm install agentping
```

## Quick start

```typescript
import { AgentPingClient } from "agentping";

const client = new AgentPingClient({ apiKey: "ap_sk_..." });

// Send an alert (voice call with retry)
const alert = await client.sendAlert({
  title: "Deploy approval needed",
  severity: "normal",
  message: "v2.4.1 ready for production. 3 migrations pending.",
  alert_type: "approval",
});

console.log(alert.id);     // "550e8400-..."
console.log(alert.status); // "waiting_for_primary_ack"

// Check status later
const status = await client.getAlert(alert.id);
console.log(status.status); // "acknowledged", "escalating", etc.

// Acknowledge programmatically (stops escalation)
const ack = await client.acknowledge(alert.id);
console.log(ack.status); // "acknowledged"
```

## Agent framework integration

The SDK includes an OpenAI-compatible tool definition you can plug into any agent framework:

```typescript
import { AgentPingClient, toolDefinition, handleToolCall } from "agentping";

const client = new AgentPingClient({ apiKey: "ap_sk_..." });

// 1. Add to your agent's tools
const tools = [toolDefinition()];

// 2. When the agent calls the tool, handle it:
const result = await handleToolCall(client, toolCallArgs);
```

### OpenAI example

```typescript
import OpenAI from "openai";
import { AgentPingClient, toolDefinition, handleToolCall } from "agentping";

const openai = new OpenAI();
const agentping = new AgentPingClient({ apiKey: "ap_sk_..." });

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "system",
      content: `You are a helpful assistant.
When you need the user's attention and they haven't responded,
use the agentping_alert tool to escalate via voice call.
Always try messaging in chat first — use agentping_alert as a fallback.`,
    },
    { role: "user", content: "Monitor my deploy and alert me if it fails." },
  ],
  tools: [toolDefinition()] as OpenAI.ChatCompletionTool[],
});

for (const toolCall of response.choices[0].message.tool_calls ?? []) {
  if (toolCall.function.name === "agentping_alert") {
    const args = JSON.parse(toolCall.function.arguments);
    const result = await handleToolCall(agentping, args);
    console.log(`Alert sent: ${result.id}`);
  }
}
```

### Anthropic Claude example

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { AgentPingClient, toolDefinition, handleToolCall } from "agentping";

const anthropic = new Anthropic();
const agentping = new AgentPingClient({ apiKey: "ap_sk_..." });

// Convert OpenAI tool format to Anthropic format
const openaiTool = toolDefinition();
const fn = openaiTool.function as Record<string, unknown>;
const anthropicTool = {
  name: fn.name as string,
  description: fn.description as string,
  input_schema: fn.parameters as Anthropic.Tool.InputSchema,
};

const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  system: `You are a helpful assistant.
When you need the user's attention and they haven't responded,
use the agentping_alert tool to escalate via voice call.`,
  messages: [
    { role: "user", content: "Monitor my deploy and alert me if it fails." },
  ],
  tools: [anthropicTool],
});

for (const block of response.content) {
  if (block.type === "tool_use" && block.name === "agentping_alert") {
    const result = await handleToolCall(
      agentping,
      block.input as Record<string, unknown>,
    );
    console.log(`Alert sent: ${result.id}`);
  }
}
```

## Severity levels

| Severity | Behavior |
|----------|----------|
| `normal` | Voice call with retries (2 min apart), respects quiet hours |
| `critical` | Voice call with retries, bypasses quiet hours |

> **Deprecated:** `low`, `urgent`, and `persistent_critical` are still accepted for backwards compatibility. `persistent_critical` maps to `critical`; others map to `normal`.

## Alert types

| Type | Default Delay | Use when |
|------|---------------|----------|
| `approval` | 300s (5 min) | Agent needs a decision |
| `task_failure` | 120s (2 min) | Something broke |
| `threshold` | 600s (10 min) | Metric crossed a boundary |
| `reminder` | 300s (5 min) | Time-sensitive nudge |
| `other` | 0s (immediate) | General escalation |

## Error handling

```typescript
import {
  AgentPingClient,
  RateLimitError,
  ForbiddenError,
} from "agentping";

const client = new AgentPingClient({ apiKey: "ap_sk_..." });

try {
  await client.sendAlert({ title: "Test", severity: "normal" });
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log("Too many alerts — wait before retrying");
  } else if (err instanceof ForbiddenError) {
    console.log(`Policy violation: ${err.message}`);
  }
}
```

## API reference

- `new AgentPingClient({ apiKey, baseUrl?, timeout? })` — create a client
- `client.sendAlert({ title, severity, message?, alert_type?, delay_seconds?, phone_number?, expires_in_minutes?, metadata? })` — create an alert
- `client.getAlert(alertId)` — get alert status
- `client.acknowledge(alertId, ackSource?)` — acknowledge an alert

## Links

- [AgentPing docs](https://agentping.me/docs)
- [API reference](https://agentping.me/docs)
- [GitHub](https://github.com/Sparkling-AI/agentping-sdk/tree/main/typescript)
