import { describe, expect, it } from "vitest";
import { toModelMessages } from "@/modules/conversation/service";

const msg = (role: "user" | "assistant", content: string) => ({ role, content });

describe("toModelMessages", () => {
  it("keeps roles and content", () => {
    const out = toModelMessages([msg("user", "hi"), msg("assistant", "hello"), msg("user", "loan")]);
    expect(out.map((c) => c.role)).toEqual(["user", "assistant", "user"]);
    expect(out[2].content).toBe("loan");
  });

  it("keeps only the most recent 40 messages", () => {
    const history = Array.from({ length: 60 }, (_, i) => msg(i % 2 === 0 ? "user" : "assistant", `m${i}`));
    const out = toModelMessages(history);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.at(-1)!.content).toBe("m59");
  });

  it("drops oldest messages when the text is too long, and always starts with a user turn", () => {
    const history = [
      msg("user", "a".repeat(20_000)),
      msg("assistant", "b".repeat(5_000)),
      msg("user", "c".repeat(20_000)),
      msg("assistant", "short"),
      msg("user", "latest"),
    ];
    const out = toModelMessages(history);
    expect(out[0].role).toBe("user");
    expect(out.at(-1)!.content).toBe("latest");
    const total = out.reduce((n, c) => n + c.content.length, 0);
    expect(total).toBeLessThanOrEqual(30_000);
  });
});
