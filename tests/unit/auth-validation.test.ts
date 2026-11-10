import { describe, expect, it } from "vitest";
import { loginSchema, signupSchema } from "@/lib/validation/auth";

describe("signupSchema", () => {
  const valid = { full_name: "  Ravi Kumar ", email: " Ravi@Example.COM ", password: "longenough" };

  it("accepts valid input and normalises name and email", () => {
    const r = signupSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.full_name).toBe("Ravi Kumar");
      expect(r.data.email).toBe("ravi@example.com");
    }
  });

  it("rejects short passwords", () => {
    expect(signupSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });

  it("rejects passwords over 72 characters", () => {
    expect(signupSchema.safeParse({ ...valid, password: "a".repeat(73) }).success).toBe(false);
  });

  it("rejects invalid email and empty name", () => {
    expect(signupSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, full_name: "   " }).success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(signupSchema.safeParse({}).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts email + password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });
  it("rejects empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});
