import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detectProjectRoot } from "../../../src/detection/project-detector.js";

const TMP_ROOT = join(process.cwd(), ".tmp-detection-tests");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("detectProjectRoot", () => {
  it("prefers explicit projectRoot when provided", () => {
    const result = detectProjectRoot({ projectRoot: "/explicit/root" });
    expect(result.projectRoot).toBe("/explicit/root");
  });

  it("returns cwd when no projectRoot override is provided", () => {
    const result = detectProjectRoot();
    expect(result.projectRoot).toBe(process.cwd());
  });
});
