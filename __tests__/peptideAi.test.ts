import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import { jwtVerify } from "jose";
import {
  peptideAiPolicy,
  peptideAiAnchorDay,
  peptideAiInputsChanged,
  peptideAiOutOfSync,
  peptideAiLaunchUrl,
  peptideAiStartUrl,
  readPeptideAiUsage,
  pushPeptideAiPolicies,
  isPeptideAiConfigured,
  type PeptideAiPolicy,
} from "@/lib/peptideAi";
import {
  peptideAiState,
  formatUsd,
  formatCycleDate,
  ordinalDay,
  type PeptideAiUsage,
} from "@/lib/peptideAiPresentation";

const SECRET = "test-secret-test-secret-test-secret-0123";
const key = new TextEncoder().encode(SECRET);
const STATE = "AbCdEfGhIjKlMnOpQrStUvWx12345678";

const client = {
  id: "inner-glow-a1b2c3d4",
  slug: "inner-glow",
  displayName: "Inner Glow",
  status: "active" as const,
  joinedAt: "2026-03-09",
};
const ON = { enabled: true, capCents: null };
const noBilling = { billingDay: null, lastRebilledOverride: null, paused: false };

describe("peptideAiAnchorDay", () => {
  it("follows the re-bill schedule's day: billing day → last-billed override → join date", () => {
    expect(peptideAiAnchorDay(client, { billingDay: 14, lastRebilledOverride: "2026-05-28" })).toBe(14);
    expect(peptideAiAnchorDay(client, { billingDay: null, lastRebilledOverride: "2026-05-28" })).toBe(28);
    expect(peptideAiAnchorDay(client, null)).toBe(9);
  });

  it("is null rather than today when nothing is known (the caller pins one)", () => {
    expect(peptideAiAnchorDay({ joinedAt: null }, noBilling)).toBeNull();
  });

  it("skips impossible days instead of passing them on", () => {
    expect(peptideAiAnchorDay({ joinedAt: "2025-01-45" }, null)).toBeNull();
    expect(peptideAiAnchorDay({ joinedAt: "2025-01-00" }, { billingDay: 0, lastRebilledOverride: "nope" })).toBeNull();
    expect(peptideAiAnchorDay({ joinedAt: "2025-01-12" }, { billingDay: 40, lastRebilledOverride: null })).toBe(12);
  });
});

describe("peptideAiPolicy", () => {
  it("defaults to on with a $50 budget", () => {
    const p = peptideAiPolicy(client, null, ON, 9);
    expect(p).toMatchObject({ enabled: true, offReason: null, capCents: 5000, name: "Inner Glow", anchorDay: 9 });
  });

  it("uses the admin's budget override", () => {
    expect(peptideAiPolicy(client, null, { enabled: true, capCents: 12_000 }, 9).capCents).toBe(12_000);
  });

  it("is off when switched off, churned or paused — in that order of reasons", () => {
    expect(peptideAiPolicy(client, null, { enabled: false, capCents: null }, 9)).toMatchObject({
      enabled: false,
      offReason: "disabled",
    });
    expect(peptideAiPolicy({ ...client, status: "inactive" }, null, ON, 9).offReason).toBe("churned");
    expect(peptideAiPolicy({ ...client, status: "archived" }, null, ON, 9).offReason).toBe("churned");
    expect(peptideAiPolicy(client, { paused: true }, ON, 9).offReason).toBe("paused");
    // Onboarding clients get it.
    expect(peptideAiPolicy({ ...client, status: "onboarding" }, null, ON, 9).enabled).toBe(true);
  });

  it("never sends an empty name", () => {
    expect(peptideAiPolicy({ ...client, displayName: "  " }, null, ON, 9).name).toBe("inner-glow");
  });
});

describe("peptideAiInputsChanged", () => {
  it("only fires when status, name or join date actually change", () => {
    expect(peptideAiInputsChanged(client, { status: "active", displayName: "Inner Glow", joinedAt: "2026-03-09" })).toBe(false);
    expect(peptideAiInputsChanged(client, { status: "archived" })).toBe(true);
    expect(peptideAiInputsChanged(client, { displayName: "Glow 2" })).toBe(true);
    expect(peptideAiInputsChanged(client, { joinedAt: null })).toBe(true);
    expect(peptideAiInputsChanged(client, {})).toBe(false);
  });
});

const usage = (spentCents: number, extra: Partial<Extract<PeptideAiUsage, { provisioned: true }>> = {}) => ({
  clientId: "inner-glow-a1b2c3d4",
  provisioned: true as const,
  status: "active",
  suspendedBy: null,
  name: "Inner Glow",
  capCents: 5000,
  anchorDay: 9,
  spentCents,
  periodStart: "2026-10-09 00:00:00",
  periodEnd: "2026-11-09 00:00:00",
  lastActiveAt: "2026-10-20 12:00:00",
  createdAt: "2026-10-01 12:00:00",
  ...extra,
});

describe("peptideAiOutOfSync", () => {
  const policy = peptideAiPolicy(client, null, ON, 9);

  it("is in step when Peptide AI matches the policy, or never saw the client", () => {
    expect(peptideAiOutOfSync(policy, usage(10))).toBe(false);
    expect(peptideAiOutOfSync(policy, { clientId: policy.clientId, provisioned: false })).toBe(false);
    expect(peptideAiOutOfSync(policy, undefined)).toBe(false);
  });

  it("catches a missed switch-off, a missed switch-on and missed policy edits", () => {
    const off = peptideAiPolicy({ ...client, status: "archived" }, null, ON, 9);
    expect(peptideAiOutOfSync(off, usage(10))).toBe(true);
    expect(peptideAiOutOfSync(off, usage(10, { status: "suspended", suspendedBy: "agency" }))).toBe(false);
    expect(peptideAiOutOfSync(policy, usage(10, { status: "suspended", suspendedBy: "agency" }))).toBe(true);
    expect(peptideAiOutOfSync(policy, usage(10, { capCents: 8000 }))).toBe(true);
    expect(peptideAiOutOfSync(policy, usage(10, { anchorDay: 14 }))).toBe(true);
    expect(peptideAiOutOfSync(policy, usage(10, { name: "Old name" }))).toBe(true);
  });

  it("leaves a ban by a Peptide AI admin alone", () => {
    expect(peptideAiOutOfSync(policy, usage(10, { status: "banned", suspendedBy: "admin" }))).toBe(false);
  });
});

describe("peptideAiState", () => {
  it("classifies spend against the budget with the 80% warning", () => {
    expect(peptideAiState(true, usage(3999))).toBe("active");
    expect(peptideAiState(true, usage(4000))).toBe("near_cap");
    expect(peptideAiState(true, usage(5000))).toBe("capped");
    expect(peptideAiState(true, usage(5040))).toBe("capped");
  });

  it("separates never opened, opened-but-unused, blocked, off and unreachable", () => {
    expect(peptideAiState(true, { clientId: "c", provisioned: false })).toBe("never_opened");
    expect(peptideAiState(true, usage(0, { lastActiveAt: null }))).toBe("not_used");
    expect(peptideAiState(true, usage(10, { status: "banned" }))).toBe("blocked");
    expect(peptideAiState(false, usage(10))).toBe("off");
    expect(peptideAiState(true, null)).toBe("unknown");
  });
});

describe("formatting", () => {
  it("formats cents as dollars", () => {
    expect(formatUsd(5000)).toBe("$50.00");
    expect(formatUsd(1234.5678)).toBe("$12.35");
    expect(formatUsd(0.4)).toBe("<$0.01");
    expect(formatUsd(123_456_78)).toBe("$123,456.78");
  });

  it("dates a cycle boundary by its UTC day", () => {
    expect(formatCycleDate("2026-11-14 00:00:00")).toBe("Nov 14, 2026");
  });

  it("writes ordinal days", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinalDay)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st",
    ]);
  });
});

describe("talking to Peptide AI", () => {
  const policy: PeptideAiPolicy = {
    clientId: "inner-glow-a1b2c3d4",
    enabled: true,
    offReason: null,
    name: "Inner Glow",
    capCents: 5000,
    anchorDay: 14,
  };

  beforeEach(() => {
    vi.stubEnv("PEPTIDE_AI_URL", "https://ai.example.test/");
    vi.stubEnv("PEPTIDE_AI_SHARED_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("starts a launch at Peptide AI's /sso/start", () => {
    expect(peptideAiStartUrl()).toBe("https://ai.example.test/sso/start");
  });

  it("mints a minute-long launch token bound to the browser's state and carrying the policy", async () => {
    const before = Date.now();
    const url = new URL(await peptideAiLaunchUrl(policy, STATE));
    expect(url.origin + url.pathname).toBe("https://ai.example.test/sso");
    const { payload } = await jwtVerify(url.searchParams.get("t")!, key, {
      issuer: "agencycollective-dashboard",
      audience: "peptide-ai/sso",
      algorithms: ["HS256"],
    });
    expect(payload).toMatchObject({ sub: policy.clientId, name: "Inner Glow", capCents: 5000, anchorDay: 14, nonce: STATE });
    expect(payload.jti).toBeTruthy();
    expect(payload.exp! - payload.iat!).toBe(60);
    expect(payload.ts as number).toBeGreaterThanOrEqual(before);
  });

  it("refuses to mint for a client who is off, a bad state, or without config", async () => {
    await expect(peptideAiLaunchUrl({ ...policy, enabled: false, offReason: "paused" }, STATE)).rejects.toThrow();
    await expect(peptideAiLaunchUrl(policy, "short")).rejects.toThrow(/state/);
    vi.stubEnv("PEPTIDE_AI_SHARED_SECRET", "short");
    await expect(peptideAiLaunchUrl(policy, STATE)).rejects.toThrow(/not configured/);
  });

  it("only talks to Peptide AI over https, except on this machine", () => {
    vi.stubEnv("PEPTIDE_AI_URL", "http://ai.example.test");
    expect(isPeptideAiConfigured()).toBe(false);
    vi.stubEnv("PEPTIDE_AI_URL", "http://localhost:3101");
    expect(isPeptideAiConfigured()).toBe(true);
    vi.stubEnv("PEPTIDE_AI_URL", "not a url");
    expect(isPeptideAiConfigured()).toBe(false);
  });

  function mockPartner() {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({
          accounts: body.accounts.map((a: { clientId: string }) => ({ clientId: a.clientId, provisioned: false })),
          rejected: [],
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("pushes policy with a partner token bound to the exact body", async () => {
    const fetchMock = mockPartner();
    const usage = await pushPeptideAiPolicies([policy, { ...policy, clientId: "bad id/../" }]);
    expect([...usage.keys()]).toEqual([policy.clientId]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ai.example.test/api/partner/accounts");
    const bearer = String((init.headers as Record<string, string>).Authorization).replace("Bearer ", "");
    const { payload } = await jwtVerify(bearer, key, { audience: "peptide-ai/partner" });
    expect(payload.bh).toBe(crypto.createHash("sha256").update(String(init.body)).digest("base64url"));
    expect(typeof payload.ts).toBe("number");
    expect(JSON.parse(String(init.body)).accounts).toEqual([
      { clientId: policy.clientId, enabled: true, name: "Inner Glow", capCents: 5000, anchorDay: 14 },
    ]);
  });

  it("reads usage without sending any policy", async () => {
    const fetchMock = mockPartner();
    await readPeptideAiUsage([policy.clientId]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).accounts).toEqual([{ clientId: policy.clientId }]);
  });

  it("throws when Peptide AI answers with an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 502 })));
    await expect(pushPeptideAiPolicies([policy])).rejects.toThrow(/HTTP 502/);
  });
});
