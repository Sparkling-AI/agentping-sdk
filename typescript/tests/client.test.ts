import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentPingClient } from "../src/client.js";
import {
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  AgentPingError,
} from "../src/errors.js";

// ── Helpers ─────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

const BASE = "https://api.agentping.me";

// ── Tests ───────────────────────────────────────────────────────────

describe("AgentPingClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ── sendAlert ───────────────────────────────────────────────────

  describe("sendAlert", () => {
    it("sends minimal request", async () => {
      const fn = mockFetch(201, {
        id: "a-1",
        status: "escalating_sms",
        severity: "low",
        alert_type: "other",
        title: "Hi",
        created_at: "2026-03-14T12:00:00Z",
        expires_at: "2026-03-14T13:00:00Z",
      });
      globalThis.fetch = fn;

      const client = new AgentPingClient({ apiKey: "ap_sk_test" });
      const result = await client.sendAlert({ title: "Hi", severity: "low" });

      expect(result.id).toBe("a-1");
      expect(result.status).toBe("escalating_sms");
      expect(fn).toHaveBeenCalledTimes(1);

      const [url, opts] = fn.mock.calls[0];
      expect(url).toBe(`${BASE}/v1/alerts`);
      expect(opts.method).toBe("POST");
      expect(opts.headers["X-API-Key"]).toBe("ap_sk_test");

      const body = JSON.parse(opts.body);
      expect(body.title).toBe("Hi");
      expect(body.severity).toBe("low");
      expect(body.message).toBeUndefined();
    });

    it("sends all fields", async () => {
      const fn = mockFetch(201, { id: "a-2", status: "waiting_for_primary_ack" });
      globalThis.fetch = fn;

      const client = new AgentPingClient({ apiKey: "k" });
      await client.sendAlert({
        title: "Deploy?",
        severity: "urgent",
        message: "v2.4.1",
        alert_type: "approval",
        delay_seconds: 300,
        phone_number: "+14155550123",
        expires_in_minutes: 30,
        metadata: { version: "2.4.1" },
      });

      const body = JSON.parse(fn.mock.calls[0][1].body);
      expect(body.message).toBe("v2.4.1");
      expect(body.alert_type).toBe("approval");
      expect(body.delay_seconds).toBe(300);
      expect(body.phone_number).toBe("+14155550123");
      expect(body.expires_in_minutes).toBe(30);
      expect(body.metadata.version).toBe("2.4.1");
    });

    it("omits undefined optional fields from body", async () => {
      const fn = mockFetch(201, { id: "a-3" });
      globalThis.fetch = fn;

      const client = new AgentPingClient({ apiKey: "k" });
      await client.sendAlert({ title: "T", severity: "low" });

      const body = JSON.parse(fn.mock.calls[0][1].body);
      expect(Object.keys(body)).toEqual(["title", "severity"]);
    });
  });

  // ── getAlert ────────────────────────────────────────────────────

  describe("getAlert", () => {
    it("fetches alert detail", async () => {
      const fn = mockFetch(200, {
        id: "a-1",
        status: "acknowledged",
        severity: "urgent",
        alert_type: "approval",
        title: "T",
        message: null,
        acknowledged_at: "2026-03-14T12:05:00Z",
        acknowledged_via: "api",
        escalation_step: 0,
        delay_seconds: 300,
        expires_at: null,
        created_at: "2026-03-14T12:00:00Z",
        metadata: null,
        deliveries: [],
      });
      globalThis.fetch = fn;

      const client = new AgentPingClient({ apiKey: "k" });
      const result = await client.getAlert("a-1");

      expect(result.status).toBe("acknowledged");
      expect(fn.mock.calls[0][0]).toBe(`${BASE}/v1/alerts/a-1`);
      expect(fn.mock.calls[0][1].method).toBe("GET");
    });
  });

  // ── acknowledge ─────────────────────────────────────────────────

  describe("acknowledge", () => {
    it("defaults to api source", async () => {
      const fn = mockFetch(200, {
        status: "acknowledged",
        acknowledged_at: "2026-03-14T12:05:00Z",
        acknowledged_via: "api",
      });
      globalThis.fetch = fn;

      const client = new AgentPingClient({ apiKey: "k" });
      const result = await client.acknowledge("a-1");

      expect(result.acknowledged_via).toBe("api");
      const body = JSON.parse(fn.mock.calls[0][1].body);
      expect(body.ack_source).toBe("api");
    });

    it("passes custom ack source", async () => {
      const fn = mockFetch(200, {
        status: "acknowledged",
        acknowledged_at: "2026-03-14T12:05:00Z",
        acknowledged_via: "chat",
      });
      globalThis.fetch = fn;

      const client = new AgentPingClient({ apiKey: "k" });
      await client.acknowledge("a-1", "chat");

      const body = JSON.parse(fn.mock.calls[0][1].body);
      expect(body.ack_source).toBe("chat");
    });
  });

  // ── Error mapping ───────────────────────────────────────────────

  describe("error mapping", () => {
    it("401 → AuthenticationError", async () => {
      globalThis.fetch = mockFetch(401, { detail: "Invalid API key" });
      const client = new AgentPingClient({ apiKey: "bad" });
      await expect(
        client.sendAlert({ title: "T", severity: "low" }),
      ).rejects.toThrow(AuthenticationError);
    });

    it("403 → ForbiddenError", async () => {
      globalThis.fetch = mockFetch(403, { detail: "Trial expired" });
      const client = new AgentPingClient({ apiKey: "k" });
      await expect(
        client.sendAlert({ title: "T", severity: "low" }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("404 → NotFoundError", async () => {
      globalThis.fetch = mockFetch(404, { detail: "Alert not found" });
      const client = new AgentPingClient({ apiKey: "k" });
      await expect(client.getAlert("nope")).rejects.toThrow(NotFoundError);
    });

    it("422 → ValidationError with errors array", async () => {
      const errors = [{ loc: ["body", "severity"], msg: "Input should be..." }];
      globalThis.fetch = mockFetch(422, { detail: errors });
      const client = new AgentPingClient({ apiKey: "k" });

      try {
        await client.sendAlert({ title: "T", severity: "bad" as any });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).statusCode).toBe(422);
      }
    });

    it("429 → RateLimitError", async () => {
      globalThis.fetch = mockFetch(429, { detail: "Rate limit exceeded" });
      const client = new AgentPingClient({ apiKey: "k" });
      await expect(
        client.sendAlert({ title: "T", severity: "low" }),
      ).rejects.toThrow(RateLimitError);
    });

    it("500 → AgentPingError", async () => {
      globalThis.fetch = mockFetch(500, { detail: "Internal error" });
      const client = new AgentPingClient({ apiKey: "k" });
      await expect(
        client.sendAlert({ title: "T", severity: "low" }),
      ).rejects.toThrow(AgentPingError);
    });

    it("error includes status code", async () => {
      globalThis.fetch = mockFetch(403, { detail: "Forbidden" });
      const client = new AgentPingClient({ apiKey: "k" });
      try {
        await client.sendAlert({ title: "T", severity: "low" });
      } catch (e) {
        expect((e as ForbiddenError).statusCode).toBe(403);
      }
    });

    it("error includes message", async () => {
      globalThis.fetch = mockFetch(401, { detail: "Missing X-API-Key header" });
      const client = new AgentPingClient({ apiKey: "" });
      try {
        await client.sendAlert({ title: "T", severity: "low" });
      } catch (e) {
        expect((e as AuthenticationError).message).toBe(
          "Missing X-API-Key header",
        );
      }
    });
  });

  // ── Constructor options ─────────────────────────────────────────

  describe("constructor", () => {
    it("uses default base URL", async () => {
      const fn = mockFetch(201, { id: "a-1" });
      globalThis.fetch = fn;

      const client = new AgentPingClient({ apiKey: "k" });
      await client.sendAlert({ title: "T", severity: "low" });

      expect(fn.mock.calls[0][0]).toContain("api.agentping.me");
    });

    it("uses custom base URL", async () => {
      const fn = mockFetch(201, { id: "a-1" });
      globalThis.fetch = fn;

      const client = new AgentPingClient({
        apiKey: "k",
        baseUrl: "http://localhost:8000",
      });
      await client.sendAlert({ title: "T", severity: "low" });

      expect(fn.mock.calls[0][0]).toContain("localhost:8000");
    });

    it("strips trailing slash from base URL", async () => {
      const fn = mockFetch(201, { id: "a-1" });
      globalThis.fetch = fn;

      const client = new AgentPingClient({
        apiKey: "k",
        baseUrl: "http://localhost:8000/",
      });
      await client.sendAlert({ title: "T", severity: "low" });

      expect(fn.mock.calls[0][0]).toBe("http://localhost:8000/v1/alerts");
    });
  });
});
