import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "../../../src/shared/logger.js";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    logger.configure("info");
  });

  it("filters logs below configured level", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    logger.configure("warn");

    logger.debug("debug_event", { a: 1 });

    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("emits structured payload for enabled levels", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logger.error("plugin_failure", { code: "E_TEST" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const firstCall = errorSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    const payload = String(firstCall?.[0]);
    expect(payload).toContain('"event":"plugin_failure"');
    expect(payload).toContain('"level":"error"');
  });

  it("omits metadata field when not provided", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logger.info("startup_complete");

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const firstCall = infoSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    const payload = String(firstCall?.[0]);
    expect(payload).toContain('"event":"startup_complete"');
    expect(payload).not.toContain('"metadata"');
  });
});
