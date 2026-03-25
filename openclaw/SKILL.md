---
name: agentping
description: Phone call alerts when your agent needs urgent attention. Voice escalation with retries, snooze, and acknowledgement tracking. Like on-call for devs.
version: 1.0.4
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

# AgentPing - Phone Call Alerts for AI Agents

**Get a free account at [agentping.me](https://agentping.me) to get started.** You'll need to verify your phone number and generate an API key.

AgentPing gets the user's attention when normal chat is not enough. It places voice calls to the user's verified phone number, with retries, snooze, and acknowledgement tracking.

**AgentPing is an escalation layer, not a messaging service and not an approval system.** Use it when the user truly needs to notice something. For approval workflows, a phone acknowledgement means the user received the alert, not that they approved the action.

## The Core Pattern

### Preferred Pattern: Schedule First, Escalate Second

If the agent supports timers, scheduled checks, or deferred tasks, use this pattern:

1. **Send a chat message** explaining what you need.
2. **Record a checkpoint** for the conversation, such as the latest user message ID or timestamp.
3. **Schedule a follow-up check** at the escalation deadline.
4. At that check:
   - If the user has replied since the checkpoint -> do nothing.
   - If the user has not replied -> call `agentping_alert` with `delay_seconds: 0`.

This is the safest integration pattern for the current service because AgentPing is only invoked if the user still has not replied.

### Fallback Pattern: Create Delayed Alert Immediately

Only use this if the agent cannot schedule a future check:

1. **Send a chat message** explaining what you need.
2. **Call `agentping_alert`** with a nonzero `delay_seconds`.
3. If the user replies before the delay expires, **immediately call the acknowledge endpoint** with `ack_source: "chat"`.
4. If the user does not reply, AgentPing will call the user's phone when the delay expires.

This fallback is less reliable. If the agent crashes, forgets, or fails to acknowledge after the user replies, the user may still get an unnecessary call.

## Tool: `agentping_alert`

Creates an escalation alert. AgentPing will call the user's verified phone if they still have not responded.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `title` | **Yes** | Short summary of what needs attention (max 500 chars). This is spoken aloud during the phone call. |
| `severity` | **Yes** | Use `"normal"` or `"critical"` for new integrations. |
| `message` | No | Longer context (max 2000 chars). Spoken during the voice call. |
| `alert_type` | No | Category that sets a default delay if `delay_seconds` is omitted. |
| `delay_seconds` | No | Seconds to wait before calling (0-3600). Overrides the alert_type default. |
| `phone_number` | No | Target verified phone number in E.164 format. If omitted, AgentPing uses the primary verified number. |
| `expires_in_minutes` | No | Auto-expire after N minutes (1-1440). Use for time-sensitive events. |
| `metadata` | No | JSON object with tracking data (task IDs, URLs, run IDs, etc.). |

### Choosing Severity

| Severity | When to use | Behavior |
|----------|------------|----------|
| `normal` | Default choice. User should respond soon but it is not an emergency. | Voice call with retries. Respects quiet hours if the user's plan and profile enable them. |
| `critical` | Something is actively broken, security-sensitive, or genuinely time-critical. | Voice call with retries. Bypasses quiet hours. |

Use `normal` unless the situation genuinely cannot wait.

Deprecated severities are still accepted for backwards compatibility:
- `low` maps to `normal`
- `urgent` maps to `normal`
- `persistent_critical` maps to `critical`

New integrations should use only `normal` and `critical`.

### Choosing Alert Type

Pick the category that best describes your situation. If you omit `delay_seconds`, AgentPing uses the alert type default:

| Alert Type | Default Delay | When to use |
|------------|---------------|-------------|
| `approval` | 5 minutes | You need a decision before you can proceed |
| `task_failure` | 2 minutes | Something broke and you cannot fix it yourself |
| `threshold` | 10 minutes | A metric or condition crossed a boundary |
| `reminder` | 5 minutes | Time-sensitive nudge the user asked for |
| `other` | 0 (immediate) | Anything else |

Important: `severity=critical` does **not** automatically override the alert type delay. If you want an immediate call, set `delay_seconds: 0`.

## API Details

**Base URL:** `https://api.agentping.me`
**Auth header:** `X-API-Key: $AGENTPING_API_KEY`

### Create an alert

Use this when the escalation window has already elapsed and the user still has not replied:

```bash
curl -s -X POST https://api.agentping.me/v1/alerts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AGENTPING_API_KEY" \
  -d '{
    "title": "Deploy approval needed",
    "severity": "normal",
    "alert_type": "approval",
    "message": "Ready to deploy v2.4.1 to production. 3 migrations pending. Waiting for your approval in chat.",
    "delay_seconds": 0,
    "metadata": {"action": "deploy", "version": "v2.4.1"}
  }'
```

Response (201):
```json
{
  "id": "alert_abc123",
  "status": "escalating_call",
  "severity": "normal",
  "alert_type": "approval",
  "title": "Deploy approval needed",
  "created_at": "2026-03-23T10:00:00Z",
  "expires_at": "2026-03-23T11:00:00Z"
}
```

### Fallback: create a delayed alert immediately

Only for agents that cannot schedule a later check:

```bash
curl -s -X POST https://api.agentping.me/v1/alerts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AGENTPING_API_KEY" \
  -d '{
    "title": "Deploy approval needed",
    "severity": "normal",
    "alert_type": "approval",
    "message": "Ready to deploy v2.4.1 to production. 3 migrations pending. Waiting for your approval in chat.",
    "delay_seconds": 300
  }'
```

This returns `waiting_for_primary_ack`. If the user replies in chat before the call starts, the agent must acknowledge the alert via API to cancel escalation.

### Check alert status

Use this to see whether the user has acknowledged.

```bash
curl -s https://api.agentping.me/v1/alerts/{alert_id} \
  -H "X-API-Key: $AGENTPING_API_KEY"
```

Key fields in the response:
- `status`: `waiting_for_primary_ack`, `escalating_call`, `acknowledged`, `snoozed`, `delivered`, `expired`, or `failed`
- `acknowledged_at`: timestamp when acknowledged, or `null`
- `acknowledged_via`: how the alert was acknowledged, such as `dtmf`, `chat`, `api`, `sms_reply`, `sms_link`, or `manual`
- `delay_seconds`: the configured wait before the first call

AgentPing does not currently push acknowledgement events back to the agent. If the agent needs to observe the result programmatically, it should poll this endpoint.

### Acknowledge an alert via API

If the user responds in chat directly, the agent should acknowledge the alert to stop escalation:

```bash
curl -s -X POST https://api.agentping.me/v1/alerts/{alert_id}/acknowledge \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AGENTPING_API_KEY" \
  -d '{"ack_source": "chat"}'
```

This is especially important when using the fallback delayed-alert pattern.

## Example Scenarios

### 1. Approval Gate

You need permission before proceeding with a deploy, purchase, or destructive action.

```
Preferred pattern:
1. Send chat: "I'm ready to deploy v2.4.1 to production. 3 migrations pending. Should I proceed?"
2. Save the current conversation checkpoint.
3. Schedule a follow-up check in 5 minutes.
4. If the user has not replied by then, call agentping_alert:
   - title: "Deploy approval needed"
   - severity: "normal"
   - alert_type: "approval"
   - delay_seconds: 0
   - message: "Ready to deploy v2.4.1 to production. 3 migrations pending. Waiting for your approval in chat."
5. If the user acknowledges the call, treat that as "message received", not approval.
6. Do not proceed until the user explicitly approves in chat.
```

### 2. Task Failure

Something broke and you cannot recover on your own.

```
1. Send chat: "Pipeline failed at stage 3 - warehouse DB connection refused after 3 retries."
2. Call agentping_alert immediately:
   - title: "Pipeline failed: ETL stage 3"
   - severity: "critical"
   - alert_type: "task_failure"
   - delay_seconds: 0
   - message: "Connection refused to warehouse DB. Retried 3x. Daily data load is blocked."
   - metadata: {"pipeline": "daily_etl", "error": "ConnectionRefusedError"}
3. severity=critical + delay_seconds=0 means immediate call and quiet-hours bypass
```

### 3. Long-Running Task Complete

A build, scrape, or report finished and the user asked to be notified if they miss the chat message.

```
Preferred pattern:
1. Send chat: "Your report is ready. 2,847 records processed. Download: [link]"
2. Save the current conversation checkpoint.
3. Schedule a follow-up check in 10 minutes.
4. If the user has not replied by then, call agentping_alert:
   - title: "Report generation complete"
   - severity: "normal"
   - alert_type: "other"
   - delay_seconds: 0
   - expires_in_minutes: 120
5. If the user replied before the scheduled check, do nothing.
```

### 4. Time-Sensitive Reminder

The user asked to be reminded about something with a deadline.

```
Preferred pattern:
1. Send chat: "Reminder: Flight UA 2847 to SFO departs at 3:45 PM. Current drive time: 48 min."
2. Save the current conversation checkpoint.
3. Schedule a follow-up check in 3 minutes.
4. If the user has not replied by then, call agentping_alert:
   - title: "Leave for airport now"
   - severity: "normal"
   - alert_type: "reminder"
   - delay_seconds: 0
   - expires_in_minutes: 60
5. Alert auto-expires after 60 minutes.
```

### 5. Security Event

Unauthorized access, leaked credential, or suspicious activity.

```
1. Send chat: "ALERT: 14 failed login attempts from IP 203.0.113.42 in the last 5 minutes."
2. Call agentping_alert immediately:
   - title: "Suspicious login activity detected"
   - severity: "critical"
   - alert_type: "task_failure"
   - delay_seconds: 0
   - message: "14 failed logins from 203.0.113.42 in 5 min. Account not locked yet."
3. severity=critical + delay_seconds=0 means immediate call and quiet-hours bypass
```

### 6. Threshold / Monitoring Alert

A metric crossed a boundary. Important, but not necessarily an emergency.

```
Preferred pattern:
1. Send chat: "Heads up - API error rate hit 7.2% (baseline: 0.8%). Top errors: 502 on /v1/alerts."
2. Save the current conversation checkpoint.
3. Schedule a follow-up check in 10 minutes.
4. If the user has not replied by then, call agentping_alert:
   - title: "API error rate above 5%"
   - severity: "normal"
   - alert_type: "threshold"
   - delay_seconds: 0
   - message: "Error rate 7.2% over last 15 min. Baseline 0.8%."
   - metadata: {"metric": "api_error_rate_15m", "value": 7.2, "threshold": 5.0}
```

## Important Rules

- **Always use chat first.** AgentPing should be the escalation path, not the first contact.
- **Prefer schedule-then-send when the agent supports it.** This avoids unnecessary calls if the user replies in chat.
- **Use the delayed-alert pattern only as a fallback.** If you use it, the agent must acknowledge the alert when the user replies in chat.
- **Use `normal` by default.** Only use `critical` for genuine emergencies.
- **For immediate calls, set `delay_seconds: 0`.** Do not assume `critical` alone removes the template delay.
- **Phone acknowledgement is not approval.** Receipt is not permission to proceed.
- **Set `expires_in_minutes` for time-bound events.** Do not keep calling about something that is already irrelevant.
- **Do not spam.** Rate limit is 20 alerts per hour.
- **Keep titles short and clear.** The title is spoken aloud during the call.
- **Include enough context in `message`.** The user should understand the issue from the phone call alone.

## External Endpoints

This skill contacts the following endpoints over HTTPS:

| Endpoint | Method | Data Sent |
|----------|--------|-----------|
| `https://api.agentping.me/v1/alerts` | POST | Alert title, severity, message, alert_type, delay_seconds, phone_number, expires_in_minutes, metadata |
| `https://api.agentping.me/v1/alerts/{id}` | GET | None (reads alert status) |
| `https://api.agentping.me/v1/alerts/{id}/acknowledge` | POST | Acknowledgement source |

All requests are authenticated with the user's `AGENTPING_API_KEY` via the `X-API-Key` header.

## Security & Privacy

- All communication with `api.agentping.me` uses HTTPS (TLS 1.2+).
- The API key (`AGENTPING_API_KEY`) is a per-user secret that authorizes requests on behalf of the user's account. It is never sent to any other service.
- Voice calls are placed only to phone numbers the user has previously verified on their AgentPing account. This skill cannot call arbitrary numbers.
- Alert content (title, message, metadata) is stored on AgentPing's servers for the user's alert history and is spoken aloud during the phone call.
- No data is shared with third parties beyond the telephony provider (Twilio) which delivers the voice call.

## What Happens During the Phone Call

When AgentPing calls the user:
- The alert title and message are spoken aloud
- The user can press **0** to acknowledge
- The user can press **1** to snooze for 5 minutes
- On paid plans, the user can enter **2-120** then **#** to snooze for a custom number of minutes

## Alert Statuses

| Status | Meaning |
|--------|---------|
| `waiting_for_primary_ack` | Delay period before the first call starts |
| `escalating_call` | Voice call delivery is in progress or retrying |
| `delivered` | A call was completed but not acknowledged |
| `acknowledged` | User acknowledged and escalation stopped |
| `snoozed` | User snoozed and will be called again later |
| `expired` | Alert timed out without acknowledgement |
| `failed` | Delivery failed |

## Failure Modes and Policy Constraints

Alert creation can fail if:
- the user has no verified phone number
- voice calls are disabled in the user's profile
- quiet hours are active for a normal-severity alert on Starter or Pro
- the account has alerts disabled or emergency stop enabled
- monthly quota or rate limits have been exceeded

Quiet-hours note:
- `normal` respects quiet hours if the user's plan and settings enable them
- `critical` bypasses quiet hours
- quiet hours are a paid-plan feature; free users do not get quiet-hours suppression

## OpenClaw Setup

Before using this skill in OpenClaw:

1. Create an AgentPing account at https://agentping.me
2. Verify at least one phone number
3. Go to https://agentping.me/api-keys and create an API key
4. Copy the key immediately because it is shown only once
5. In OpenClaw, edit `~/.openclaw/openclaw.json` and add the key under `skills.entries.agentping.apiKey`

Example:

```json5
{
  skills: {
    entries: {
      agentping: {
        enabled: true,
        apiKey: "ap_sk_your_key_here",
      },
    },
  },
}
```

This skill declares `AGENTPING_API_KEY` in its metadata, and OpenClaw maps `skills.entries.agentping.apiKey` to that env var at runtime.
