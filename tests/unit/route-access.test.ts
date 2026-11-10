import { describe, expect, it } from "vitest";
import { classifyPath, safeNextPath } from "@/lib/security/route-access";

describe("classifyPath", () => {
  it.each([
    ["/dashboard", "protected"],
    ["/cases", "protected"],
    ["/cases/new", "protected"],
    ["/cases/abc/financial", "protected"],
    ["/settings", "protected"],
    ["/login", "auth-page"],
    ["/signup", "auth-page"],
    ["/", "public"],
    ["/auth/confirm", "public"],
    ["/dashboards-fake", "public"], // prefix must be a whole path segment
    ["/casesx", "public"],
  ])("%s -> %s", (path, expected) => {
    expect(classifyPath(path)).toBe(expected);
  });
});

describe("safeNextPath (open-redirect protection)", () => {
  it("allows same-site relative paths", () => {
    expect(safeNextPath("/cases/123/chat")).toBe("/cases/123/chat");
    expect(safeNextPath("/cases?tab=open")).toBe("/cases?tab=open");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "evil.example",
    "",
    "/login",
    "/signup",
  ])("rejects %j", (bad) => {
    expect(safeNextPath(bad)).toBe("/dashboard");
  });

  it("rejects non-strings and very long values", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath(42)).toBe("/dashboard");
    expect(safeNextPath("/" + "a".repeat(3000))).toBe("/dashboard");
  });

  it("uses a custom fallback", () => {
    expect(safeNextPath("//x", "/")).toBe("/");
  });
});
