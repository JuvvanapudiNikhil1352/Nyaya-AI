import { describe, expect, it } from "vitest";
import { redactSensitive } from "@/modules/conversation/safety";

describe("redactSensitive — identifiers never stored or sent to AI", () => {
  it.each([
    ["My Aadhaar number is 1234 5678 9012", "My Aadhaar number is [removed]"],
    ["aadhaar 123456789012 ok", "aadhaar [removed] ok"],
    ["PAN ABCDE1234F", "PAN [removed]"],
    ["my bank PIN is 4321", "my bank PIN is [removed]"],
    ["OTP: 845123", "OTP: [removed]"],
    ["UPI pin 1234", "UPI pin [removed]"],
    ["password - hunter2", "password - [removed]"],
    ["account 123456789012345", "account [removed]"],
    ["card 4111 1111 1111 1111", "card [removed]"],
  ])("%s", (input, expected) => {
    const r = redactSensitive(input);
    expect(r.text).toBe(expected);
    expect(r.redacted).toBe(true);
  });

  it.each([
    "I borrowed ₹80,000 at 3% per month.",
    "I paid ₹1,00,000 on 5 March 2024.",
    "He demands 95000 rupees by 10/12/2025.",
    "I have paid 20,000 so far and 15,000 last month.",
  ])("leaves normal loan details alone: %s", (input) => {
    expect(redactSensitive(input)).toEqual({ text: input, redacted: false });
  });
});
