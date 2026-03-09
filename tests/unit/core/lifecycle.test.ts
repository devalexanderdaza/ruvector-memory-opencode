import { describe, expect, it } from "vitest";

import { deactivatePlugin } from "../../../src/core/lifecycle.js";

describe("deactivatePlugin", () => {
  it("resolves without throwing", async () => {
    await expect(deactivatePlugin()).resolves.toBeUndefined();
  });
});
