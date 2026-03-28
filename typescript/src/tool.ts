import type { AgentPingClient } from "./client.js";
import type { AlertCreateResponse, SendAlertOptions } from "./types.js";

/**
 * Returns the agentping_alert tool definition in OpenAI function-calling format.
 *
 * Add this to your agent's `tools` array.
 */
export function toolDefinition(): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: "agentping_alert",
      description:
        "Escalate an alert to the user via phone call through " +
        "AgentPing. Use this when you need the user's attention and they " +
        "haven't responded to your chat message. Always try messaging the " +
        "user in chat first — use this tool as a fallback escalation path. " +
        "Choose severity based on urgency: 'normal' for a voice call " +
        "with retry (recommended default), 'critical' for immediate call " +
        "that bypasses quiet hours with more retries.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description:
              "Short summary of what needs the user's attention. Max 500 characters.",
          },
          severity: {
            type: "string",
            enum: [
              "normal",
              "critical",
              "persistent_critical",
              "low",
              "urgent",
            ],
            description:
              "How urgently the user needs to respond. " +
              "'normal': voice call with retry (recommended default). " +
              "'critical': immediate call, more retries, bypasses quiet hours. " +
              "'persistent_critical', 'low', and 'urgent' are deprecated — " +
              "'persistent_critical' maps to 'critical', others map to 'normal'.",
          },
          message: {
            type: "string",
            description:
              "Longer description with context. Included in the voice call. Max 2000 characters.",
          },
          alert_type: {
            type: "string",
            enum: [
              "approval",
              "task_failure",
              "threshold",
              "reminder",
              "other",
            ],
            description:
              "Category of alert. Determines default escalation timing. " +
              "'approval': 5 min delay. 'task_failure': 2 min delay. " +
              "'threshold': 10 min delay. 'reminder': 5 min delay. " +
              "'other': immediate.",
          },
          delay_seconds: {
            type: "integer",
            description:
              "Seconds to wait before starting call delivery. " +
              "Gives the user time to see your chat message first. " +
              "If omitted, uses the default for the alert_type. Set to 0 for immediate.",
            minimum: 0,
            maximum: 3600,
          },
          expires_in_minutes: {
            type: "integer",
            description:
              "Auto-expire the alert after this many minutes if not acknowledged.",
            minimum: 1,
            maximum: 1440,
          },
          metadata: {
            type: "object",
            description:
              "Arbitrary key-value data stored with the alert for tracking context.",
          },
        },
        required: ["title", "severity"],
      },
    },
  };
}

/**
 * Execute an agentping_alert tool call and return the API response.
 *
 * Pass the parsed arguments object from the tool call directly.
 */
export async function handleToolCall(
  client: AgentPingClient,
  args: Record<string, unknown>,
): Promise<AlertCreateResponse> {
  return client.sendAlert(args as unknown as SendAlertOptions);
}
