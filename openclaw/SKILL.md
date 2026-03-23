---
name: agentping
description: Escalate alerts to the user via phone calls and SMS when chat messages go unanswered. Voice-first escalation layer for AI agents.
version: 1.0.0
homepage: https://agentping.me
metadata:
  openclaw:
    requires:
      env:
        - AGENTPING_API_KEY
      bins:
        - curl
    primaryEnv: AGENTPING_API_KEY
    emoji: "\U0001F4DE"
---

# AgentPing — Escalation Alerts for AI Agents

AgentPing gets the user's attention when your chat messages aren't enough. It places **phone calls** (and optionally SMS) to the user's verified phone number, with retries, snooze, and acknowledgement tracking.

**AgentPing is an escalation layer, not a messaging service.** Always try the chat first. Only use this tool when the user hasn't responded and you genuinely need their attention.

## The Core Pattern: Chat First, Escalate Second

Every time you need the user's attention:

1. **Send a chat message** explaining what you need
2. **Call `agentping_alert`** with a delay (gives the user time to see your chat)
3. If the user responds to your chat within the delay → AgentPing cancels the escalation automatically
4. If not → AgentPing calls the user's phone
5. The user acknowledges via phone keypad → you get notified

**Never skip step 1.** A phone call should always be the fallback, not the first contact.

## Tool: `agentping_alert`

Creates an escalation alert. AgentPing will call the user's phone if they don't respond in time.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `title` | **Yes** | Short summary of what needs attention (max 500 chars). This is spoken aloud during the phone call. |
| `severity` | **Yes** | `"normal"` or `"critical"` (see below) |
| `message` | No | Longer context (max 2000 chars). Included in SMS and voice call. |
| `alert_type` | No | Category that sets a sensible default delay (see below) |
| `delay_seconds` | No | Seconds to wait before calling (0–3600). Overrides the alert_type default. |
| `expires_in_minutes` | No | Auto-expire after N minutes (1–1440). Use for time-sensitive events. |
| `metadata` | No | JSON object with tracking data (task IDs, URLs, etc.) |

### Choosing Severity

| Severity | When to use | Behavior |
|----------|------------|----------|
| `normal` | **Default choice.** User should respond soon but it's not an emergency. | Voice call with retries. Respects quiet hours. |
| `critical` | Something is actively broken, security incident, or time-critical. | Voice call with retries. **Bypasses quiet hours.** |

Use `normal` unless the situation genuinely cannot wait. Most alerts should be `normal`.

### Choosing Alert Type

Pick the category that best describes your situation — it sets a sensible default delay before the phone call starts:

| Alert Type | Default Delay | When to use |
|------------|---------------|-------------|
| `approval` | 5 minutes | You need a decision before you can proceed |
| `task_failure` | 2 minutes | Something broke and you can't fix it yourself |
| `threshold` | 10 minutes | A metric or condition crossed a boundary |
| `reminder` | 5 minutes | Time-sensitive nudge the user asked for |
| `other` | 0 (immediate) | Anything else |

You can always override the delay with `delay_seconds`.

## API Details

**Base URL:** `https://api.agentping.me`
**Auth header:** `X-API-Key: $AGENTPING_API_KEY`

### Create an alert

```bash
curl -s -X POST https://api.agentping.me/v1/alerts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AGENTPING_API_KEY" \
  -d '{
    "title": "Deploy approval needed",
    "severity": "normal",
    "alert_type": "approval",
    "message": "Ready to deploy v2.4.1 to production. 3 migrations pending.",
    "delay_seconds": 300,
    "metadata": {"action": "deploy", "version": "v2.4.1"}
  }'
```

Response (201):
```json
{
  "id": "alert_abc123",
  "status": "waiting_for_primary_ack",
  "severity": "normal",
  "alert_type": "approval",
  "title": "Deploy approval needed",
  "created_at": "2026-03-23T10:00:00Z",
  "expires_at": null
}
```

### Check alert status

Use this to find out if the user has acknowledged.

```bash
curl -s https://api.agentping.me/v1/alerts/{alert_id} \
  -H "X-API-Key: $AGENTPING_API_KEY"
```

Key fields in the response:
- `status`: `"acknowledged"` means the user responded. `"delivering"` / `"escalating_call"` means still trying. `"expired"` means timed out.
- `acknowledged_at`: timestamp when acknowledged (null if not yet)
- `acknowledged_via`: how they acknowledged (`"dtmf"` = phone keypad, `"sms_reply"`, `"api"`, etc.)

### Acknowledge an alert via API

If the user responds to your chat message directly (not via phone), you can acknowledge the alert yourself to cancel the escalation:

```bash
curl -s -X POST https://api.agentping.me/v1/alerts/{alert_id}/acknowledge \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AGENTPING_API_KEY" \
  -d '{"ack_source": "chat"}'
```

**This is important.** If the user replies to your chat message, immediately acknowledge the pending alert so they don't get an unnecessary phone call.

## Example Scenarios

### 1. Approval Gate

You need permission before proceeding (deploy, purchase, delete, etc.).

```
1. Send chat: "I'm ready to deploy v2.4.1 to production. 3 migrations pending. Should I proceed?"
2. Call agentping_alert:
   - title: "Deploy approval needed"
   - severity: "normal"
   - alert_type: "approval"
   - message: "Ready to deploy v2.4.1 to production. 3 migrations pending. Waiting for your go-ahead."
   - delay_seconds: 300
3. Wait for user response in chat OR acknowledgement via phone
4. If user replies in chat → acknowledge the alert via API → proceed based on their answer
5. If user acknowledges via phone → treat as approval to proceed
```

### 2. Task Failure

Something broke and you can't recover on your own.

```
1. Send chat: "Pipeline failed at stage 3 — warehouse DB connection refused after 3 retries."
2. Call agentping_alert:
   - title: "Pipeline failed: ETL stage 3"
   - severity: "critical"
   - alert_type: "task_failure"
   - message: "Connection refused to warehouse DB. Retried 3x. Daily data load is blocked."
   - metadata: {"pipeline": "daily_etl", "error": "ConnectionRefusedError"}
3. severity=critical means immediate call, no delay
```

### 3. Long-Running Task Complete

A build, scrape, or report finished and the user is waiting for it.

```
1. Send chat: "Your report is ready! 2,847 records processed. Download: [link]"
2. Call agentping_alert:
   - title: "Report generation complete"
   - severity: "normal"
   - alert_type: "other"
   - delay_seconds: 600
   - expires_in_minutes: 120
3. If user sees the chat within 10 min → acknowledge via API
4. Otherwise → phone call to let them know
```

### 4. Time-Sensitive Reminder

The user asked to be reminded about something with a deadline.

```
1. Send chat: "Reminder: Flight UA 2847 to SFO departs at 3:45 PM. Current drive time: 48 min."
2. Call agentping_alert:
   - title: "Leave for airport now"
   - severity: "normal"
   - alert_type: "reminder"
   - delay_seconds: 180
   - expires_in_minutes: 60
3. Alert auto-expires after 60 min — no point calling about a flight that already left
```

### 5. Security Event

Unauthorized access, leaked credential, or suspicious activity.

```
1. Send chat: "ALERT: 14 failed login attempts from IP 203.0.113.42 in the last 5 minutes."
2. Call agentping_alert:
   - title: "Suspicious login activity detected"
   - severity: "critical"
   - alert_type: "task_failure"
   - message: "14 failed logins from 203.0.113.42 in 5 min. Account not locked yet."
3. severity=critical → immediate call, bypasses quiet hours
```

### 6. Threshold / Monitoring Alert

A metric crossed a boundary. Important but not an emergency.

```
1. Send chat: "Heads up — API error rate hit 7.2% (baseline: 0.8%). Top errors: 502 on /v1/alerts."
2. Call agentping_alert:
   - title: "API error rate above 5%"
   - severity: "normal"
   - alert_type: "threshold"
   - message: "Error rate 7.2% over last 15 min. Baseline 0.8%."
   - metadata: {"metric": "api_error_rate_15m", "value": 7.2, "threshold": 5.0}
3. threshold default delay is 10 min — gives user time to notice in chat
```

## Important Rules

- **Always chat first.** Never call `agentping_alert` without sending a chat message first.
- **Use `normal` severity by default.** Only use `critical` for genuine emergencies.
- **Acknowledge alerts when the user responds in chat.** Call the acknowledge endpoint so the phone call gets cancelled.
- **Set `expires_in_minutes` for time-bound events.** Don't keep calling about something that's already past.
- **Don't spam.** Rate limit is 20 alerts/hour. If you're hitting that, you're alerting too much.
- **Don't use AgentPing for routine messages.** It's for escalation — things the user truly needs to act on.
- **Keep titles short and clear.** The title is spoken aloud during the phone call.
- **Include context in the message field.** The user needs enough info to decide what to do without opening their laptop.

## What Happens During the Phone Call

When AgentPing calls the user:
- The alert title and message are spoken aloud
- The user can press **0** to acknowledge (stops further calls)
- The user can press **1** to snooze for 5 minutes
- On paid plans, the user can enter **2–120** then **#** to snooze for a custom number of minutes

## Alert Statuses

| Status | Meaning |
|--------|---------|
| `waiting_for_primary_ack` | Delay period — waiting for user to respond via chat |
| `escalating_call` | Phone call in progress |
| `delivered` | Call completed but user hasn't acknowledged yet |
| `acknowledged` | User acknowledged — escalation stopped |
| `snoozed` | User snoozed — will be called again after snooze expires |
| `expired` | Alert timed out without acknowledgement |
| `failed` | Delivery failed |

## Setup

The user needs an AgentPing account at https://agentping.me with:
1. A verified phone number
2. An API key (starts with `ap_sk_`)

Set the API key as the `AGENTPING_API_KEY` environment variable.
