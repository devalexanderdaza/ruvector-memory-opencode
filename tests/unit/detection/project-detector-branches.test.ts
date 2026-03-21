import { describe, expect, it, vi } from "vitest";
import { detectProjectContext } from "../../../src/detection/project-detector.js";
import { join } from "node:path";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";

const TMP_ROOT = join(process.cwd(), ".tmp-unit-project-detector");

describe("project-detector", () => {
  it("detects projects with only readme", async () => {
    mkdirSync(TMP_ROOT, { recursive: true });
    writeFileSync(join(TMP_ROOT, "README.md"), "This is a TypeScript project with Node.js");
    
    const result = await detectProjectContext({ projectRoot: TMP_ROOT });
    expect(result.primaryLanguage).toBe("typescript");
    expect(result.projectName).toBe(".tmp-unit-project-detector");
    rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  it("detects javascript projects from readme", async () => {
    mkdirSync(TMP_ROOT, { recursive: true });
    writeFileSync(join(TMP_ROOT, "README.md"), "This is a javascript project");
    
    const result = await detectProjectContext({ projectRoot: TMP_ROOT });
    expect(result.primaryLanguage).toBe("javascript");
    rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  it("detects monorepos from package.json workspaces array", async () => {
    mkdirSync(TMP_ROOT, { recursive: true });
    writeFileSync(join(TMP_ROOT, "package.json"), JSON.stringify({
      name: "monorepo-test",
      workspaces: ["packages/*"]
    }));
    
    const result = await detectProjectContext({ projectRoot: TMP_ROOT });
    expect(result.projectType).toBe("monorepo");
    expect(result.projectName).toBe("monorepo-test");
    rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  it("detects monorepos from package.json workspaces object", async () => {
    mkdirSync(TMP_ROOT, { recursive: true });
    writeFileSync(join(TMP_ROOT, "package.json"), JSON.stringify({
      name: "monorepo-obj-test",
      workspaces: { packages: ["apps/*"] }
    }));
    
    const result = await detectProjectContext({ projectRoot: TMP_ROOT });
    expect(result.projectType).toBe("monorepo");
    rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  it("handles malformed package.json gracefully", async () => {
    mkdirSync(TMP_ROOT, { recursive: true });
    writeFileSync(join(TMP_ROOT, "package.json"), "{ invalid json }");
    
    const result = await detectProjectContext({ projectRoot: TMP_ROOT });
    expect(result.projectName).toBe(".tmp-unit-project-detector");
    rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  it("detects web-apps from framework dependencies", async () => {
    mkdirSync(TMP_ROOT, { recursive: true });
    writeFileSync(join(TMP_ROOT, "package.json"), JSON.stringify({
      dependencies: { "next": "latest", "react": "latest" }
    }));
    
    const result = await detectProjectContext({ projectRoot: TMP_ROOT });
    expect(result.projectType).toBe("web-app");
    expect(result.frameworks).toContain("nextjs");
    expect(result.frameworks).toContain("react");
    rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  it("detects api-services from framework dependencies", async () => {
    mkdirSync(TMP_ROOT, { recursive: true });
    writeFileSync(join(TMP_ROOT, "package.json"), JSON.stringify({
      dependencies: { "nestjs": "latest" }
    }));
    
    const result = await detectProjectContext({ projectRoot: TMP_ROOT });
    expect(result.projectType).toBe("api-service");
    expect(result.frameworks).toContain("nestjs");
    rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  it("handles empty workspaces array correctly", async () => {
    mkdirSync(TMP_ROOT, { recursive: true });
    writeFileSync(join(TMP_ROOT, "package.json"), JSON.stringify({
      workspaces: []
    }));
    
    const result = await detectProjectContext({ projectRoot: TMP_ROOT });
    expect(result.projectType).toBe("node-package");
    rmSync(TMP_ROOT, { recursive: true, force: true });
  });
});
