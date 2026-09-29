import { describe, expect, it } from "vitest";

describe("deterministic test network boundary", () => {
  it("rejects unmocked external fetches before opening a connection", async () => {
    await expect(fetch("https://example.com/should-not-be-requested")).rejects.toThrow(
      "Blocked external fetch in deterministic test",
    );
  });
});
