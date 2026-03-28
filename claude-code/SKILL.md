---
name: agentping
description: Phone call alerts via AgentPing. Use when the user asks to be called, pinged, or phoned — e.g. "call me when done", "ping me if you need me", "phone me if I don't reply".
allowed-tools: Bash
---

# AgentPing — Phone Call Alerts

AgentPing calls the user's verified phone number when they need to be alerted. It is an **escalation layer** — always send a chat message first, then escalate to a phone call if the user hasn't responded.

**Requires:** `AGENTPING_API_KEY` environment variable.

## Setup

Before using AgentPing, check if the API key is set:

```bash
echo "${AGENTPING_API_KEY:+set}"
```

If the key is **not set**, guide the user through setup:

1. Tell them to get an API key at https://agentping.me/api-keys (they need an account and a verified phone number first).
2. Ask the user for their API key.
3. Once they provide it, offer to add it to their shell profile so it persists across sessions:

```bash
echo '\nexport AGENTPING_API_KEY="THE_KEY"' >> ~/.zshrc
```

Use `~/.zshrc` on macOS, `~/.bashrc` on Linux. Always confirm with the user before writing to their shell profile.

4. After writing, remind the user to run `source ~/.zshrc` (or restart their terminal) for the change to take effect in other sessions. The current Claude Code session will need the key exported manually:

```bash
export AGENTPING_API_KEY="THE_KEY"
```

## When to Use

Activate when the user says things like:
- "call me when it's done"
- "ping me if you need something"
- "this is urgent, call me if I don't reply in 5 minutes"
- "phone me when the build finishes"

Do NOT use AgentPing for:
- Routine status updates (just use chat)
- Every minor question (only escalate when the user asked for it or the situation is genuinely urgent)

## Creating an Alert

```bash
curl -s -X POST https://api.agentping.me/v1/alerts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AGENTPING_API_KEY" \
  -d '{
    "title": "SHORT_TITLE",
    "severity": "normal",
    "alert_type": "ALERT_TYPE",
    "message": "DETAILED_CONTEXT",
    "delay_seconds": DELAY
  }'
```

Save the returned `id` field — you need it to acknowledge or check status.

## Patterns

### "Call me when it's done"

User wants a phone call after a long-running task completes.

1. Complete the task.
2. Send a chat message with the results.
3. Create an alert with `delay_seconds: 300` (5 min grace period for the user to see chat first).
4. If the user replies in chat before the call fires, **acknowledge the alert immediately**.

Example:
```bash
curl -s -X POST https://api.agentping.me/v1/alerts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AGENTPING_API_KEY" \
  -d '{
    "title": "Task complete: database migration",
    "severity": "normal",
    "alert_type": "other",
    "message": "Migration finished successfully. 3 tables updated, 0 errors. Check chat for details.",
    "delay_seconds": 300
  }'
```

### "Call me if you need me / if I don't reply in N minutes"

User is going AFK. Call them only if Claude needs input and the user hasn't responded.

1. Remember this instruction for the session.
2. When you actually need input: send a chat message asking your question.
3. Create an alert with `delay_seconds` matching what the user specified (default 300 if unspecified).
4. If the user replies in chat, **acknowledge the alert immediately**.
5. Do NOT create the alert preemptively — only when you genuinely need input.

Example:
```bash
curl -s -X POST https://api.agentping.me/v1/alerts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AGENTPING_API_KEY" \
  -d '{
    "title": "Need your input on test failures",
    "severity": "normal",
    "alert_type": "approval",
    "message": "3 tests are failing after the refactor. I need to know whether to fix them or skip. Check chat for details.",
    "delay_seconds": 300
  }'
```

### "Call me right now" / Immediate escalation

User explicitly wants an immediate call, or something critical happened.

1. Send a chat message explaining the situation.
2. Create an alert with `delay_seconds: 0`.

### Task failure

Something broke that the user must know about.

1. Send a chat message with the error details.
2. Create an alert with `alert_type: "task_failure"` and `delay_seconds: 0` for critical failures, or `delay_seconds: 120` for non-critical ones.

## Acknowledging Alerts

**Critical:** When the user replies in chat after you created a delayed alert, immediately acknowledge it to cancel the phone call:

```bash
curl -s -X POST https://api.agentping.me/v1/alerts/{alert_id}/acknowledge \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AGENTPING_API_KEY" \
  -d '{"ack_source": "chat"}'
```

## Checking Alert Status

```bash
curl -s https://api.agentping.me/v1/alerts/{alert_id} \
  -H "X-API-Key: $AGENTPING_API_KEY"
```

Statuses: `waiting_for_primary_ack` (delay period), `escalating_call` (calling), `acknowledged`, `snoozed`, `delivered`, `expired`, `failed`.

## Severity and Alert Types

**Severity** — use `normal` unless genuinely urgent:
- `normal`: voice call with retries, respects quiet hours
- `critical`: voice call with retries, **bypasses quiet hours** — only for emergencies

**Alert types** (sets default delay if `delay_seconds` is omitted):

| Type | Default Delay | When |
|------|---------------|------|
| `approval` | 5 min | Need a decision to proceed |
| `task_failure` | 2 min | Something broke |
| `threshold` | 10 min | Metric crossed a boundary |
| `reminder` | 5 min | Time-sensitive nudge |
| `other` | 0 | Anything else |

## Rules

- **Chat first, call second.** Always send a chat message before creating an alert.
- **Phone ack is not approval.** If you need permission (deploy, delete, etc.), wait for explicit chat approval even after the user acknowledges the call.
- **Acknowledge promptly.** If the user replies in chat while an alert is pending, acknowledge it immediately so they don't get an unnecessary call.
- **Keep titles short.** Titles are spoken aloud on the phone call.
- **Include context in message.** The user should understand the situation from the call alone.
- **Set `expires_in_minutes`** for time-sensitive events so stale alerts auto-expire.
- **Rate limit:** max 20 alerts per hour.
