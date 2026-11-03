/**
 * Strict Semantic Versioning 2.0.0 parsing and comparison.
 *
 * A version is `MAJOR.MINOR.PATCH` with an optional `-prerelease` and an
 * optional `+build` suffix. Build metadata is parsed and preserved for
 * display, but — per the spec — it never affects precedence.
 *
 * Prerelease precedence (spec section 11): a version without a prerelease
 * outranks the same version with one; prerelease identifiers compare
 * numerically when both are numeric, numerically before alphanumerically,
 * and lexically otherwise; a shorter identifier list loses when it is a
 * prefix of a longer one.
 */

export interface SemVerParts {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  build: string[];
}

const NUMERIC = /^\d+$/;
// No leading zeroes on numeric core fields or numeric prerelease identifiers.
const CORE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const IDENT = /^[0-9A-Za-z-]+$/;

export class SemVerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemVerError";
  }
}

function parseIdentifiers(
  raw: string,
  kind: "prerelease" | "build",
): string[] {
  const parts = raw.split(".");
  for (const part of parts) {
    if (part === "" || !IDENT.test(part)) {
      throw new SemVerError(`invalid ${kind} identifier: ${JSON.stringify(raw)}`);
    }
    if (kind === "prerelease" && NUMERIC.test(part) && /^0\d+$/.test(part)) {
      throw new SemVerError(`numeric prerelease identifier must not have leading zeroes: ${part}`);
    }
  }
  return parts;
}

export class SemVer implements SemVerParts {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: string[];
  readonly build: string[];

  constructor(parts: SemVerParts) {
    this.major = parts.major;
    this.minor = parts.minor;
    this.patch = parts.patch;
    this.prerelease = [...parts.prerelease];
    this.build = [...parts.build];
  }

  /** Parse a version string. Throws SemVerError on anything non-conformant. */
  static parse(input: string): SemVer {
    if (typeof input !== "string") {
      throw new SemVerError("version must be a string");
    }
    let text = input.trim();
    if (text.startsWith("v") || text.startsWith("V")) text = text.slice(1);
    if (text === "") throw new SemVerError("empty version string");

    let build: string[] = [];
    const plus = text.indexOf("+");
    if (plus !== -1) {
      build = parseIdentifiers(text.slice(plus + 1), "build");
      text = text.slice(0, plus);
    }

    let prerelease: string[] = [];
    const dash = text.indexOf("-");
    if (dash !== -1) {
      prerelease = parseIdentifiers(text.slice(dash + 1), "prerelease");
      text = text.slice(0, dash);
    }

    const core = CORE.exec(text);
    if (!core) {
      throw new SemVerError(`invalid version core: ${JSON.stringify(input)}`);
    }
    return new SemVer({
      major: Number(core[1]),
      minor: Number(core[2]),
      patch: Number(core[3]),
      prerelease,
      build,
    });
  }

  /** Returns true instead of throwing for malformed input. */
  static isValid(input: string): boolean {
    try {
      SemVer.parse(input);
      return true;
    } catch {
      return false;
    }
  }

  get isPrerelease(): boolean {
    return this.prerelease.length > 0;
  }

  /** -1, 0, or 1. Build metadata is ignored, per spec. */
  compareTo(other: SemVer): number {
    if (this.major !== other.major) return this.major < other.major ? -1 : 1;
    if (this.minor !== other.minor) return this.minor < other.minor ? -1 : 1;
    if (this.patch !== other.patch) return this.patch < other.patch ? -1 : 1;
    return comparePrerelease(this.prerelease, other.prerelease);
  }

  equals(other: SemVer): boolean {
    return this.compareTo(other) === 0;
  }

  toString(): string {
    let out = `${this.major}.${this.minor}.${this.patch}`;
    if (this.prerelease.length > 0) out += `-${this.prerelease.join(".")}`;
    if (this.build.length > 0) out += `+${this.build.join(".")}`;
    return out;
  }
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1; // a release outranks its prerelease
  if (b.length === 0) return -1;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    const xNum = NUMERIC.test(x);
    const yNum = NUMERIC.test(y);
    if (xNum && yNum) return Number(x) < Number(y) ? -1 : 1;
    if (xNum) return -1; // numeric identifiers sort before alphanumeric
    if (yNum) return 1;
    return x < y ? -1 : 1;
  }
  // All shared identifiers equal: shorter list is lower precedence.
  return a.length < b.length ? -1 : 1;
}

/** Compare two version strings. Convenience wrapper over SemVer.parse. */
export function compare(a: string, b: string): number {
  return SemVer.parse(a).compareTo(SemVer.parse(b));
}

/** Sort a list of version strings in ascending precedence order. */
export function sortVersions(versions: Iterable<string>): string[] {
  return [...versions]
    .map((v) => SemVer.parse(v))
    .sort((x, y) => x.compareTo(y))
    .map((v) => v.toString());
}
