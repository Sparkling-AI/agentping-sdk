# AgentPing — OpenClaw Skill

Voice-call-first escalation for AI agents. When your agent truly needs you, AgentPing places a phone call to get your attention.

## Install

```bash
clawhub install agentping
```

## Setup

1. Create an account at [agentping.me](https://agentping.me)
2. Verify your phone number
3. Generate an API key at [agentping.me/api-keys](https://agentping.me/api-keys)
4. Add the key to your OpenClaw config (`~/.openclaw/openclaw.json`):

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

## What it does

- Places voice calls to your verified phone when an AI agent needs your attention
- Supports acknowledgement (press 0), snooze (press 1), and custom snooze (enter minutes + #)
- Two severity levels: `normal` (respects quiet hours) and `critical` (bypasses quiet hours)
- Retry logic, delay scheduling, and expiration built in

See [SKILL.md](./SKILL.md) for the full tool specification and usage examples.

## Links

- Website: [agentping.me](https://agentping.me)
- Docs: [agentping.me/docs](https://agentping.me/docs)
- ClawHub: [clawhub.ai/skills/agentping](https://clawhub.ai/skills/agentping)
