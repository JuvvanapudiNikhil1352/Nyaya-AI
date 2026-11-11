import { describe, expect, it } from "vitest";
import { screenMessage } from "@/modules/conversation/safety";

describe("screenMessage — threats (spec Test 5)", () => {
  it.each([
    "He threatened to beat me if I don't pay by Friday.",
    "The lender sent goons to my shop yesterday.",
    "He said he will break my legs.",
    "They came to my house at night and shouted at my wife.",
    "He is harassing my family every day with calls.",
    "He took my gold and my bike documents.",
    "He says he will share my private photos.",
    "I am scared for my family's safety.",
    "He keeps intimidating my children.",
  ])("flags: %s", (text) => {
    const r = screenMessage(text);
    expect(r.concern).toBe(true);
    expect(r.selfHarm).toBe(false);
  });
});

describe("screenMessage — self-harm", () => {
  it.each([
    "Sometimes I feel like ending my life because of this debt.",
    "I want to die, I can't pay.",
    "I thought about suicide last night.",
    "My father drank pesticide because of the lender.",
  ])("flags self-harm: %s", (text) => {
    const r = screenMessage(text);
    expect(r.selfHarm).toBe(true);
    expect(r.concern).toBe(true);
  });
});

describe("screenMessage — ordinary loan messages", () => {
  it.each([
    "I borrowed ₹80,000 at 3% per month and have repaid ₹70,000.",
    "He is demanding ₹95,000 now. I have a promissory note.",
    "I paid ₹5,000 by UPI on 10 March.",
    "The interest was cut in advance, I received only ₹90,000.",
  ])("does not flag: %s", (text) => {
    expect(screenMessage(text)).toEqual({ concern: false, selfHarm: false });
  });
});

describe("persistent pressure (raw-output finding, case 3)", () => {
  it("flags repeated calls and pressure to pay", () => {
    expect(screenMessage("He is repeatedly calling me and pressuring me to pay immediately.").concern).toBe(true);
    expect(screenMessage("The lender keeps calling my family.").concern).toBe(true);
    expect(screenMessage("I paid ₹10,000 by UPI and he called once to confirm.").concern).toBe(false);
  });
});
