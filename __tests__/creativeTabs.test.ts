import { describe, expect, it } from "vitest";
import { allowedCreativeTabs, resolveCreativeTab } from "@/components/creative/creativeTabs";
import { allPermissionsFalse } from "@/lib/permissions";

function admin(perms: Partial<ReturnType<typeof allPermissionsFalse>>, isSuper = false) {
  return { isSuper, permissions: { ...allPermissionsFalse(), ...perms } };
}

describe("resolveCreativeTab", () => {
  it("shows the requested tab only when the admin holds it", () => {
    const a = admin({ analyst: true, adcopy: true });
    expect(allowedCreativeTabs(a).map((t) => t.id)).toEqual(["analyst", "ad-copy"]);
    expect(resolveCreativeTab(a, "ad-copy")).toBe("ad-copy");
    // Not held / invalid / missing → the first tool the admin holds.
    expect(resolveCreativeTab(a, "image")).toBe("analyst");
    expect(resolveCreativeTab(a, "nope")).toBe("analyst");
    expect(resolveCreativeTab(a, null)).toBe("analyst");
  });

  it("falls back to the first held tool when the analyst isn't held", () => {
    expect(resolveCreativeTab(admin({ studio: true, jsoneditor: true }), "analyst")).toBe("image");
  });

  it("supers hold every tool; no tools → null", () => {
    expect(resolveCreativeTab(admin({}, true), "json")).toBe("json");
    expect(resolveCreativeTab(admin({}), "analyst")).toBeNull();
  });
});
