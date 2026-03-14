import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toolDefinition, handleToolCall } from "../src/tool.js";
import { AgentPingClient } from "../src/client.js";

// ── Helpers ─────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

// ── toolDefinition ──────────────────────────────────────────────────

describe("toolDefinition", () => {
  it("has type 'function'", () => {
    const td = toolDefinition();
    expect(td.type).toBe("function");
  });

  it("function name is agentping_alert", () => {
    const td = toolDefinition();
    expect((td.function as any).name).toBe("agentping_alert");
  });

  it("has a description", () => {
    const td = toolDefinition();
    expect((td.function as any).description.length).toBeGreaterThan(10);
  });

  it("parameters type is object", () => {
    const td = toolDefinition();
    const params = (td.function as any).parameters;
    expect(params.type).toBe("object");
  });

  it("requires title and severity", () => {
    const td = toolDefinition();
    const required = (td.function as any).parameters.required;
    expect(required).toContain("title");
    expect(required).toContain("severity");
    expect(required).toHaveLength(2);
  });

  it("severity has correct enum values", () => {
    const td = toolDefinition();
    const sev = (td.function as any).parameters.properties.severity;
    expect(new Set(sev.enum)).toEqual(
      new Set(["low", "urgent", "critical", "persistent_critical"]),
    );
  });

  it("alert_type has correct enum values", () => {
    const td = toolDefinition();
    const at = (td.function as any).parameters.properties.alert_type;
    expect(new Set(at.enum)).toEqual(
      new Set(["approval", "task_failure", "threshold", "reminder", "other"]),
    );
  });

  it("includes all expected properties", () => {
    const td = toolDefinition();
    const props = Object.keys((td.function as any).parameters.properties);
    for (const key of [
      "title",
      "severity",
      "message",
      "alert_type",
      "delay_seconds",
      "expires_in_minutes",
      "metadata",
    ]) {
      expect(props).toContain(key);
    }
  });

  it("delay_seconds has correct range", () => {
    const td = toolDefinition();
    const ds = (td.function as any).parameters.properties.delay_seconds;
    expect(ds.minimum).toBe(0);
    expect(ds.maximum).toBe(3600);
  });

  it("expires_in_minutes has correct range", () => {
    const td = toolDefinition();
    const eim = (td.function as any).parameters.properties.expires_in_minutes;
    expect(eim.minimum).toBe(1);
    expect(eim.maximum).toBe(1440);
  });
});

// ── handleToolCall ──────────────────────────────────────────────────

describe("handleToolCall", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("passes args to sendAlert and returns result", async () => {
    const fn = mockFetch(201, {
      id: "a-1",
      status: "escalating_sms",
      severity: "critical",
      alert_type: "other",
      title: "Server down",
      created_at: "2026-03-14T12:00:00Z",
      expires_at: "2026-03-14T12:30:00Z",
    });
    globalThis.fetch = fn;

    const client = new AgentPingClient({ apiKey: "k" });
    const result = await handleToolCall(client, {
      title: "Server down",
      severity: "critical",
    });

    expect(result.id).toBe("a-1");
    expect(result.severity).toBe("critical");

    const body = JSON.parse(fn.mock.calls[0][1].body);
    expect(body.title).toBe("Server down");
    expect(body.severity).toBe("critical");
  });

  it("passes all optional args through", async () => {
    const fn = mockFetch(201, { id: "a-2" });
    globalThis.fetch = fn;

    const client = new AgentPingClient({ apiKey: "k" });
    await handleToolCall(client, {
      title: "Need approval",
      severity: "urgent",
      message: "Deploy ready",
      alert_type: "approval",
      delay_seconds: 300,
      expires_in_minutes: 30,
      metadata: { version: "2.0" },
    });

    const body = JSON.parse(fn.mock.calls[0][1].body);
    expect(body.message).toBe("Deploy ready");
    expect(body.alert_type).toBe("approval");
    expect(body.delay_seconds).toBe(300);
    expect(body.expires_in_minutes).toBe(30);
    expect(body.metadata.version).toBe("2.0");
  });
});
