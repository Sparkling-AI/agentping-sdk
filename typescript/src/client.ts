import {
  AgentPingError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "./errors.js";
import type {
  AckSource,
  AcknowledgeResponse,
  AgentPingClientOptions,
  AlertCreateResponse,
  AlertDetailResponse,
  SendAlertOptions,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.agentping.me";
const DEFAULT_TIMEOUT = 30_000;

export class AgentPingClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(options: AgentPingClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Create an alert. Returns the created alert object.
   */
  async sendAlert(options: SendAlertOptions): Promise<AlertCreateResponse> {
    const body: Record<string, unknown> = {
      title: options.title,
      severity: options.severity,
    };
    if (options.message !== undefined) body.message = options.message;
    if (options.alert_type !== undefined) body.alert_type = options.alert_type;
    if (options.delay_seconds !== undefined)
      body.delay_seconds = options.delay_seconds;
    if (options.phone_number !== undefined)
      body.phone_number = options.phone_number;
    if (options.expires_in_minutes !== undefined)
      body.expires_in_minutes = options.expires_in_minutes;
    if (options.metadata !== undefined) body.metadata = options.metadata;

    return this.request<AlertCreateResponse>("POST", "/v1/alerts", body);
  }

  /**
   * Get alert status and delivery details.
   */
  async getAlert(alertId: string): Promise<AlertDetailResponse> {
    return this.request<AlertDetailResponse>("GET", `/v1/alerts/${alertId}`);
  }

  /**
   * Acknowledge an alert to stop escalation.
   */
  async acknowledge(
    alertId: string,
    ackSource: AckSource = "api",
  ): Promise<AcknowledgeResponse> {
    return this.request<AcknowledgeResponse>(
      "POST",
      `/v1/alerts/${alertId}/acknowledge`,
      { ack_source: ackSource },
    );
  }

  // ── Internals ─────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const resp = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (resp.ok) {
        return (await resp.json()) as T;
      }

      let detail = "";
      try {
        const json = await resp.json();
        detail =
          typeof json.detail === "string"
            ? json.detail
            : JSON.stringify(json.detail ?? json);
      } catch {
        detail = await resp.text();
      }

      switch (resp.status) {
        case 401:
          throw new AuthenticationError(detail);
        case 403:
          throw new ForbiddenError(detail);
        case 404:
          throw new NotFoundError(detail);
        case 422: {
          let errors: Record<string, unknown>[] = [];
          try {
            errors = JSON.parse(detail);
          } catch {
            /* not parseable */
          }
          throw new ValidationError(detail, errors);
        }
        case 429:
          throw new RateLimitError(detail);
        default:
          throw new AgentPingError(detail, resp.status);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
