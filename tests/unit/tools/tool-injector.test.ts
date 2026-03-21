import { describe, expect, it, vi } from "vitest";

import { injectTools } from "../../../src/tools/index.js";

describe("injectTools", () => {
  it("registers all memory tools when toolRegistry is provided", () => {
    const registerTool = vi.fn();

    const result = injectTools({
      toolRegistry: {
        registerTool,
      },
    });

    expect(result.registered).toBe(true);
    expect(registerTool).toHaveBeenCalledTimes(3);

    const registeredNames = registerTool.mock.calls.map((call) => call[0]);
    expect(registeredNames).toEqual([
      "memory_save",
      "memory_search",
      "memory_learn_from_feedback",
    ]);

    for (const call of registerTool.mock.calls) {
      expect(typeof call[1]).toBe("function");
    }
  });

  it("skips registration when toolRegistry is not provided", () => {
    const result = injectTools({});
    expect(result.registered).toBe(false);
  });
});

describe("registered tool handlers", () => {
  it("return structured ENOTIMPLEMENTED responses by default", async () => {
    const registerTool = vi.fn();

    injectTools({
      toolRegistry: {
        registerTool,
      },
    });

    const handlersByName = new Map<
      string,
      (input?: unknown) => Promise<unknown>
    >(registerTool.mock.calls.map((call) => [call[0], call[1]]));

    const save = handlersByName.get("memory_save");
    const search = handlersByName.get("memory_search");
    const learn = handlersByName.get("memory_learn_from_feedback");

    expect(save).toBeTypeOf("function");
    expect(search).toBeTypeOf("function");
    expect(learn).toBeTypeOf("function");

    const saveResult = await save?.("x");
    const searchResult = await search?.("y");
    const learnResult = await learn?.("z");

    // Save/search require activation + DB init (Story 1.5), so without activation we should
    // see activation-related structured errors.
    expect(saveResult).toMatchObject({
      success: false,
      code: "PLUGIN_NOT_ACTIVATED",
    });
    expect(searchResult).toMatchObject({
      success: false,
      code: "PLUGIN_NOT_ACTIVATED",
    });

    // Learn tool is now implemented; Zod validation runs before plugin checks.
    // Input "z" fails object validation and should return a structured validation code.
    expect(learnResult).toMatchObject({
      success: false,
      reason: "validation",
    });
    const learnErrorCode = (learnResult as { code?: string }).code;
    expect(["INVALID_FEEDBACK_INPUT", "INVALID_MEMORY_ID"]).toContain(
      learnErrorCode,
    );
  });
});
