export type Severity = "low" | "urgent" | "critical" | "persistent_critical";

export type AlertType =
  | "approval"
  | "task_failure"
  | "threshold"
  | "reminder"
  | "other";

export type AckSource = "dtmf" | "sms_link" | "api" | "chat" | "manual";

export interface SendAlertOptions {
  /** Short title for the alert (1–500 chars). */
  title: string;
  /** How urgently the user needs to respond. */
  severity: Severity;
  /** Longer description or context (max 2000 chars). */
  message?: string;
  /** Category of alert — determines default escalation timing. */
  alert_type?: AlertType;
  /** Seconds to wait before delivery (0–3600). Overrides alert_type default. */
  delay_seconds?: number;
  /** Verified E.164 phone number. Defaults to primary verified phone. */
  phone_number?: string;
  /** Auto-expire the alert after N minutes (1–1440). */
  expires_in_minutes?: number;
  /** Arbitrary key-value data stored with the alert. */
  metadata?: Record<string, unknown>;
}

export interface AlertCreateResponse {
  id: string;
  status: string;
  severity: Severity;
  alert_type: AlertType;
  title: string;
  created_at: string;
  expires_at: string | null;
}

export interface Delivery {
  id: string;
  alert_id: string;
  channel: "sms" | "voice";
  status: "queued" | "sent" | "delivered" | "failed" | "no_answer";
  to_number: string;
  provider_sid: string | null;
  error_message: string | null;
  created_at: string;
}

export interface AlertDetailResponse {
  id: string;
  status: string;
  severity: Severity;
  alert_type: AlertType;
  title: string;
  message: string | null;
  acknowledged_at: string | null;
  acknowledged_via: AckSource | null;
  escalation_step: number;
  delay_seconds: number;
  expires_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  deliveries: Delivery[] | null;
}

export interface AcknowledgeResponse {
  status: "acknowledged";
  acknowledged_at: string;
  acknowledged_via: AckSource;
}

export interface AgentPingClientOptions {
  /** Your AgentPing API key (starts with ap_sk_). */
  apiKey: string;
  /** Base URL for the API. Defaults to https://api.agentping.me */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
}
