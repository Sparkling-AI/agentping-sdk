---
name: agentping
description: Phone call alerts via AgentPing. ONLY use when the user explicitly asks to be called — e.g. "call me when done", "ping me if it stucks", "phone me if I don't reply". Never call proactively.
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

**Only when the user explicitly requests a call.** The user must say something that clearly means "phone me." Examples:
- "call me when it's done"
- "ping me if it gets stuck"
- "this is urgent, call me if I don't reply in 5 minutes"
- "phone me when the build finishes"
- "if you need me, call me"

**Do NOT use AgentPing:**
- On your own initiative — never decide by yourself that a situation warrants a phone call
- For routine status updates (just use chat)
- For every question or blocker — only escalate to a call if the user previously asked you to
- Because something failed or seems urgent — unless the user explicitly told you to call them in that scenario

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

## Critical Behavior: Always Create the Alert Alongside Your Message

**The alert IS the timer.** When you need to notify the user (task done, need input, something broke), you MUST create the alert **in the same response** as your chat message. Do not send a chat message and wait for a reply — you will never get to the alert creation step.

**WRONG** (common mistake):
1. Send chat message asking a question
2. Wait for user to reply ← you stop here and the alert never gets created

**RIGHT:**
1. In a single response: explain the situation in chat AND call the curl command to create the alert
2. The alert's `delay_seconds` acts as the timer — if the user replies before it fires, acknowledge to cancel

## Intent Mapping

When the user asks to be called, classify their intent using this table:

| User says | Intent | delay_seconds | alert_type | When to create alert |
|-----------|--------|---------------|------------|---------------------|
| "call me when it's done" | Completion | `0` | `other` | Immediately after task completes |
| "call me if I don't reply in N min" | Silence detection | `N * 60` | `other` | Immediately alongside your chat message |
| "call me if you need me" / "if you get stuck" | Blocker escalation | `300` (or user-specified) | `approval` | BEFORE attempting an action that may need permission |
| "call me if it fails" / "if something breaks" | Failure escalation | `0` | `task_failure` | Only when a failure actually occurs |
| "call me before you deploy/delete/migrate" | Pre-approval | `300` (or user-specified) | `approval` | When you're ready for the action and need permission |
| "call me right now" | Immediate | `0` | `other` | Right now |

## Patterns

### Completion — "Call me when it's done"

The user wants a call when the task finishes. This is an **immediate call** — the user explicitly asked to be interrupted.

1. Complete the task.
2. **In the same response:** send a chat message with the results AND create the alert with `delay_seconds: 0`.

Example — your response should contain both a chat message AND this curl call:
```bash
curl -s -X POST https://api.agentping.me/v1/alerts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AGENTPING_API_KEY" \
  -d '{
    "title": "Task complete: database migration",
    "severity": "normal",
    "alert_type": "other",
    "message": "Migration finished successfully. 3 tables updated, 0 errors. Check chat for details.",
    "delay_seconds": 0
  }'
```

### Silence detection — "Call me if I don't reply in N minutes"

The user might see the chat message in time. The call is a **fallback** if they don't.

1. Post your chat message (results, question, status).
2. **In the same response:** create the alert with `delay_seconds` matching the user's specified time (default 300 if unspecified).
3. If the user replies in chat before the delay expires, **acknowledge the alert immediately** to cancel the call.

Example:
```bash
curl -s -X POST https://api.agentping.me/v1/alerts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AGENTPING_API_KEY" \
  -d '{
    "title": "Build finished — results ready",
    "severity": "normal",
    "alert_type": "other",
    "message": "Build completed with 2 warnings. Check chat for details.",
    "delay_seconds": 300
  }'
```

### Blocker escalation — "Call me if you need me / if you get stuck"

The user is going AFK. Call them when you need their input or approval to continue.

**Key limitation:** once you send a tool call that triggers a permission prompt (e.g., "Allow Bash? Yes/No"), you are frozen — you cannot create an alert at that point. You must create the alert **before** you get stuck, not after.

There are two types of blockers:

**Decision blockers** (you need the user's opinion on something):
You control the response, so you can write your question + create the alert in the same turn.

**Permission blockers** (you need the user to approve a tool call):
You must create the alert **before** attempting the action that might need approval. The alert acts as a safety net — if the user is watching, they approve the tool and acknowledge the alert; if not, the call goes out.

1. Remember this instruction for the session.
2. Continue working autonomously on steps that don't need approval.
3. **When you're about to do something that may need the user's input or approval:** in a **single response**, explain what you're about to do in chat AND create the alert. Then attempt the action.
4. Use `delay_seconds` matching what the user specified (default 300).
5. **If the action succeeds without needing help** (e.g., auto-approved), **acknowledge the alert immediately** so the user doesn't get a false call. Continue working.
6. If the user replies or approves before the delay expires, **acknowledge the alert immediately** to cancel the call.

Example — decision blocker (need user's opinion):
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

Example — permission blocker (about to run something that needs approval):
```bash
curl -s -X POST https://api.agentping.me/v1/alerts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AGENTPING_API_KEY" \
  -d '{
    "title": "Waiting for your approval to run migration",
    "severity": "normal",
    "alert_type": "approval",
    "message": "I need to run the database migration but it requires your approval. Check Claude Code to approve or reject.",
    "delay_seconds": 300
  }'
```

### Failure escalation — "Call me if it fails / breaks / gets stuck"

Only applicable if the user previously asked to be called on failure. Call immediately when a failure occurs.

1. **In the same response:** send a chat message with the error details AND create the alert with `delay_seconds: 0`.
2. If the user did NOT ask to be called for failures, just report the error in chat. Do not call.

Example:
```bash
curl -s -X POST https://api.agentping.me/v1/alerts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AGENTPING_API_KEY" \
  -d '{
    "title": "Build failed: 12 test errors",
    "severity": "normal",
    "alert_type": "task_failure",
    "message": "The build failed with 12 test errors after the refactor. Blocked until you decide how to proceed. Check chat for details.",
    "delay_seconds": 0
  }'
```

### Pre-approval — "Call me before you deploy / delete / migrate"

The user wants to approve a specific action before it happens. **Phone acknowledgement is NOT permission** — you must wait for explicit chat approval.

1. When you're ready for the action, **in a single response:** explain what you want to do in chat AND create the alert.
2. Use `delay_seconds` matching what the user specified (default 300).
3. **Do NOT proceed with the action** until the user explicitly approves in chat, even if they acknowledge the phone call.

Example:
```bash
curl -s -X POST https://api.agentping.me/v1/alerts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AGENTPING_API_KEY" \
  -d '{
    "title": "Ready to deploy — need your approval",
    "severity": "normal",
    "alert_type": "approval",
    "message": "Migration is ready. 3 tables will be altered, 1 dropped. Waiting for your go-ahead in chat before proceeding.",
    "delay_seconds": 300
  }'
```

### Immediate — "Call me right now"

User explicitly wants an immediate call.

**In a single response:** send a chat message explaining the situation AND create the alert with `delay_seconds: 0`.

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

- **Explicit request only.** Never create an alert unless the user explicitly asked to be called. No proactive calls, no matter how urgent you think the situation is.
- **Chat message + alert in the same response.** Never send a chat message and then wait — create the alert in the same turn. The delay_seconds is the timer; you don't need to wait yourself.
- **Phone ack is not approval.** If you need permission (deploy, delete, etc.), wait for explicit chat approval even after the user acknowledges the call.
- **Acknowledge promptly.** If the user replies in chat while an alert is pending, acknowledge it immediately so they don't get an unnecessary call.
- **Keep titles short.** Titles are spoken aloud on the phone call.
- **Include context in message.** The user should understand the situation from the call alone.
- **Set `expires_in_minutes`** for time-sensitive events so stale alerts auto-expire.
- **Rate limit:** max 20 alerts per hour.
