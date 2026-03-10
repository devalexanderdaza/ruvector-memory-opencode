import { NodeVersionError } from "./errors.js";

function parseVersion(version: string): [number, number, number] {
  const clean = version.replace(/^v/, "").trim();
  const [major = "0", minor = "0", patch = "0"] = clean.split(".");
  return [
    Number.parseInt(major, 10),
    Number.parseInt(minor, 10),
    Number.parseInt(patch, 10),
  ];
}

export function isNodeVersionSupported(
  currentVersion: string,
  minVersion = "22.0.0",
): boolean {
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

export function validateNodeVersion(
  currentVersion = process.versions.node,
): void {
  if (!isNodeVersionSupported(currentVersion, "22.0.0")) {
    throw new NodeVersionError(currentVersion);
  }
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic embedding for local-first tests and bootstrapping.
 *
 * Note: This is NOT a semantic embedding model. It is intentionally stable and fast to
 * allow end-to-end save/search behavior to be tested without external model calls.
 */
export function embedTextDeterministic(
  text: string,
  dimensions: number,
): Float32Array {
  const vec = new Float32Array(dimensions);
  const seed = fnv1a32(text);

  // Simple xorshift32 PRNG seeded from content hash
  let x = seed || 0x12345678;
  for (let i = 0; i < dimensions; i += 1) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // Map uint32 → [-1, 1]
    const u = (x >>> 0) / 0xffffffff;
    vec[i] = u * 2 - 1;
  }

  return vec;
}
