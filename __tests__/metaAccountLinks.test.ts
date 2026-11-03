import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/metaAccounts.ts talks to Turso through lib/db — record the statements instead.
const execute = vi.fn(async (..._args: unknown[]) => ({ rowsAffected: 1, rows: [] }));
const batch = vi.fn(async (stmts: unknown[]) => stmts.map(() => ({ rowsAffected: 1 })));
vi.mock("@/lib/db", () => ({
  getDb: () => ({ execute, batch }),
  ensureMigrated: async () => {},
  isUniqueViolation: () => false,
}));

import { metaAccountLinkHref } from "@/lib/metaAccountRules";
import {
  bulkCreateMetaAccounts,
  createMetaAccount,
  InvalidMetaAccountLinkError,
  updateMetaAccount,
} from "@/lib/metaAccounts";

// Positions in INSERT_COLUMNS (lib/metaAccounts.ts).
const TWOFA_LINK = 4;
const PROFILE_LINK = 8;
const NOTES = 20;

const HOSTILE = [
  "javascript:alert(document.cookie)",
  "JavaScript:alert(1)",
  "java\tscript:alert(1)",
  " javascript:alert(1)",
  "\u0001javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "mailto:someone@example.com",
  "file:///etc/passwd",
  "//evil.example.com/x",
  "/relative/path",
  "N/A",
  "100012345678",
  "http://",
];

beforeEach(() => {
  execute.mockClear();
  batch.mockClear();
});

describe("metaAccountLinkHref", () => {
  it("keeps http(s) URLs as entered", () => {
    expect(metaAccountLinkHref("https://www.facebook.com/profile.php?id=1000")).toBe(
      "https://www.facebook.com/profile.php?id=1000"
    );
    expect(metaAccountLinkHref("http://2fa.live/tok/ABCD")).toBe("http://2fa.live/tok/ABCD");
    expect(metaAccountLinkHref("HTTPS://FB.COM/x")).toBe("HTTPS://FB.COM/x");
    expect(metaAccountLinkHref("  https://facebook.com/x  ")).toBe("https://facebook.com/x");
  });

  it("adds https:// to bare domains", () => {
    expect(metaAccountLinkHref("facebook.com/some.profile")).toBe("https://facebook.com/some.profile");
    expect(metaAccountLinkHref("www.facebook.com")).toBe("https://www.facebook.com");
    expect(metaAccountLinkHref("2fa.live/tok/ABCD EFGH")).toBe("https://2fa.live/tok/ABCD EFGH");
    expect(metaAccountLinkHref("m.facebook.com:443/x?y=1")).toBe("https://m.facebook.com:443/x?y=1");
  });

  it("rejects every non-web value", () => {
    for (const v of HOSTILE) expect(metaAccountLinkHref(v), JSON.stringify(v)).toBeNull();
  });

  it("treats blank as no link", () => {
    expect(metaAccountLinkHref("")).toBeNull();
    expect(metaAccountLinkHref("   ")).toBeNull();
    expect(metaAccountLinkHref(null)).toBeNull();
    expect(metaAccountLinkHref(undefined)).toBeNull();
  });
});

describe("createMetaAccount link validation", () => {
  it.each(["profileLink", "twofaLink"] as const)("rejects a javascript: %s before writing", async (field) => {
    const secret = "javascript:alert('s3cr3t')";
    const err = await createMetaAccount({ fbEmail: "a@example.com", [field]: secret }).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidMetaAccountLinkError);
    expect(err.field).toBe(field);
    expect(err.message).toMatch(/http\(s\) URL/);
    // Route error logs print the message — it must never carry the (credential) value.
    expect(err.message).not.toContain("s3cr3t");
    expect(execute).not.toHaveBeenCalled();
  });

  it("stores http(s) links as entered and normalizes bare domains", async () => {
    const account = await createMetaAccount({
      fbEmail: "a@example.com",
      profileLink: "facebook.com/a",
      twofaLink: "https://2fa.live/tok/X",
    });
    expect(account.profileLink).toBe("https://facebook.com/a");
    expect(account.twofaLink).toBe("https://2fa.live/tok/X");
    const args = (execute.mock.calls[0][0] as { args: unknown[] }).args;
    expect(args[PROFILE_LINK]).toBe("https://facebook.com/a");
    expect(args[TWOFA_LINK]).toBe("https://2fa.live/tok/X");
  });

  it("allows empty links", async () => {
    const account = await createMetaAccount({ fbEmail: "a@example.com", profileLink: "  ", twofaLink: null });
    expect(account.profileLink).toBeNull();
    expect(account.twofaLink).toBeNull();
  });
});

describe("updateMetaAccount link validation", () => {
  it("rejects a non-web link without writing", async () => {
    await expect(updateMetaAccount("id1", { notes: "x", twofaLink: "data:text/html,x" })).rejects.toBeInstanceOf(
      InvalidMetaAccountLinkError
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("normalizes a bare domain and lets null/blank clear the field", async () => {
    await updateMetaAccount("id1", { profileLink: "www.facebook.com/x", twofaLink: "" });
    const { sql, args } = execute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(sql).toContain("profile_link = ?");
    expect(args[0]).toBe("https://www.facebook.com/x");
    expect(args[1]).toBeNull();
  });

  it("leaves untouched fields alone (inline stage edit)", async () => {
    await updateMetaAccount("id1", { stage: "setup" });
    const { sql } = execute.mock.calls[0][0] as { sql: string };
    expect(sql).not.toContain("profile_link");
  });
});

describe("bulkCreateMetaAccounts (import)", () => {
  it("skips non-web link cells, says why in notes, and imports the row", async () => {
    const n = await bulkCreateMetaAccounts([
      {
        fbEmail: "a@example.com",
        profileLink: "javascript:alert(1)",
        twofaLink: "vbscript:TOPSECRET",
        notes: "Login: Yes, Day 1",
      },
      { fbEmail: "b@example.com", profileLink: "facebook.com/b", twofaLink: "https://2fa.live/tok/B" },
    ]);
    expect(n).toBe(2);
    const [first, second] = (batch.mock.calls[0][0] as { args: unknown[] }[]).map((s) => s.args);

    expect(first[PROFILE_LINK]).toBeNull();
    expect(first[TWOFA_LINK]).toBeNull();
    const notes = String(first[NOTES]);
    expect(notes).toContain("Login: Yes, Day 1");
    expect(notes).toContain("Profile link not imported (not an http(s) URL): javascript:alert(1)");
    expect(notes).toContain("2FA link not imported");
    // The 2FA link is a credential; notes are API-readable.
    expect(notes).not.toContain("TOPSECRET");

    expect(second[PROFILE_LINK]).toBe("https://facebook.com/b");
    expect(second[TWOFA_LINK]).toBe("https://2fa.live/tok/B");
    expect(second[NOTES]).toBeNull();
  });
});
