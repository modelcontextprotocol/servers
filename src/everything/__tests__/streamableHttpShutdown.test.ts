import { describe, expect, it, vi } from "vitest";
import { closeActiveTransports } from "../transports/streamableHttpShutdown.js";

describe("closeActiveTransports", () => {
  it("closes and removes every active transport", async () => {
    const firstClose = vi.fn<() => Promise<void>>().mockResolvedValue();
    const secondClose = vi.fn<() => Promise<void>>().mockResolvedValue();
    const transports = new Map([
      ["first-session", { close: firstClose }],
      ["second-session", { close: secondClose }],
    ]);

    await closeActiveTransports(transports);

    expect(firstClose).toHaveBeenCalledOnce();
    expect(secondClose).toHaveBeenCalledOnce();
    expect(transports.size).toBe(0);
  });
});
