import { NodeVersionError } from "./errors.js";

function parseVersion(version: string): [number, number, number] {
  const clean = version.replace(/^v/, "").trim();
  const [major = "0", minor = "0", patch = "0"] = clean.split(".");
  return [Number.parseInt(major, 10), Number.parseInt(minor, 10), Number.parseInt(patch, 10)];
}

export function isNodeVersionSupported(currentVersion: string, minVersion = "22.0.0"): boolean {
  const current = parseVersion(currentVersion);
  const minimum = parseVersion(minVersion);

  if (current[0] !== minimum[0]) {
    return current[0] > minimum[0];
  }

  if (current[1] !== minimum[1]) {
    return current[1] > minimum[1];
  }

  return current[2] >= minimum[2];
}

export function validateNodeVersion(currentVersion = process.versions.node): void {
  if (!isNodeVersionSupported(currentVersion, "22.0.0")) {
    throw new NodeVersionError(currentVersion);
  }
}
