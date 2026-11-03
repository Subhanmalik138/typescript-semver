/**
 * npm-style version range matching, implemented from scratch on top of
 * src/semver.ts — no dependency on the `semver` package.
 *
 * Supported syntax (one range set may be joined with `||` for alternation,
 * and comparators inside a set are AND-ed):
 *
 *   1.2.3            exact version
 *   1.2.x  1.x  *    wildcards (x, X, or *)
 *   ^1.2.3           caret: compatible within the left-most non-zero part
 *   ~1.2.3  ~1.2     tilde: patch-level (or minor-level) changes allowed
 *   >=1.2.3 <2.0.0   comparators, also <=, >, = (space/comma separated)
 *   1.2.3 - 2.3.4    hyphen range (inclusive both ends; partial ends
 *                    behave like wildcards, e.g. `1.2 - 2.3`)
 *
 * Prerelease rule (mirrors npm): a version with a prerelease tag only
 * satisfies a range if at least one comparator in the same set carries a
 * prerelease with the same MAJOR.MINOR.PATCH. This keeps `^1.2.3` from
 * accidentally matching `2.0.0-beta.1` while still letting an explicit
 * `>=1.0.0-alpha.1 <2.0.0` range admit prereleases.
 */

import { SemVer, SemVerError } from "./semver";

export class RangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RangeError";
  }
}

type Op = ">=" | "<=" | ">" | "<" | "=";

interface Comparator {
  op: Op;
  version: SemVer;
}

interface ComparatorSet {
  comparators: Comparator[];
  /** True if any comparator in this set has a prerelease tag. */
  allowsPrerelease: boolean;
}

const PARTIAL = /^v?(0|[1-9]\d*|[xX*])(?:\.(0|[1-9]\d*|[xX*]))?(?:\.(0|[1-9]\d*|[xX*]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function isWildcard(part: string | undefined): boolean {
  return part === undefined || part === "x" || part === "X" || part === "*";
}

function toSemVer(major: string, minor: string | undefined, patch: string | undefined, pre: string | undefined): SemVer {
  const preParts = pre ? pre.split(".") : [];
  return new SemVer({
    major: Number(major),
    minor: minor === undefined ? 0 : Number(minor),
    patch: patch === undefined ? 0 : Number(patch),
    prerelease: preParts,
    build: [],
  });
}

/** Expand a caret range into [lower, upper) comparator bounds. */
function caretBounds(major: string, minor: string | undefined, patch: string | undefined, pre: string | undefined): Comparator[] {
  const lower = toSemVer(major, minor, patch, pre);
  let upper: SemVer;
  if (major !== "0") {
    upper = new SemVer({ major: Number(major) + 1, minor: 0, patch: 0, prerelease: [], build: [] });
  } else if (!isWildcard(minor) && minor !== "0") {
    upper = new SemVer({ major: 0, minor: Number(minor) + 1, patch: 0, prerelease: [], build: [] });
  } else if (!isWildcard(patch) && patch !== undefined) {
    upper = new SemVer({ major: 0, minor: 0, patch: Number(patch) + 1, prerelease: [], build: [] });
  } else if (minor === "0") {
    // ^0.0.x pins the minor at 0, so only patch may vary.
    upper = new SemVer({ major: 0, minor: 1, patch: 0, prerelease: [], build: [] });
  } else {
    // ^0, ^0.x, ^* — nothing is pinned, so the range is unbounded above
    // except for the major-0 ceiling applied below via major check.
    upper = new SemVer({ major: 1, minor: 0, patch: 0, prerelease: [], build: [] });
  }
  if (isWildcard(major)) return []; // ^* matches everything
  return [
    { op: ">=", version: lower },
    { op: "<", version: upper },
  ];
}

/** Expand a tilde range into [lower, upper) comparator bounds. */
function tildeBounds(major: string, minor: string | undefined, patch: string | undefined, pre: string | undefined): Comparator[] {
  if (isWildcard(major)) return [];
  const lower = toSemVer(major, minor, patch, pre);
  // Tilde pins major and (when given) minor: ~1.2.3 := >=1.2.3 <1.3.0.
  // Only a bare ~1 widens to the next major.
  let upper: SemVer;
  if (isWildcard(minor)) {
    upper = new SemVer({ major: Number(major) + 1, minor: 0, patch: 0, prerelease: [], build: [] });
  } else {
    upper = new SemVer({ major: Number(major), minor: Number(minor) + 1, patch: 0, prerelease: [], build: [] });
  }
  return [
    { op: ">=", version: lower },
    { op: "<", version: upper },
  ];
}

/**
 * Expand a bare partial version (no operator) into comparator bounds.
 * Wildcards widen the match: `1.2.x` -> >=1.2.0 <1.3.0, `1.x` -> >=1.0.0
 * <2.0.0, `*` -> no comparators (matches everything).
 */
function partialBounds(major: string, minor: string | undefined, patch: string | undefined, pre: string | undefined): Comparator[] {
  if (isWildcard(major)) return [];
  if (isWildcard(minor)) {
    return [
      { op: ">=", version: toSemVer(major, undefined, undefined, undefined) },
      { op: "<", version: new SemVer({ major: Number(major) + 1, minor: 0, patch: 0, prerelease: [], build: [] }) },
    ];
  }
  if (isWildcard(patch) || patch === undefined) {
    return [
      { op: ">=", version: toSemVer(major, minor, undefined, undefined) },
      { op: "<", version: new SemVer({ major: Number(major), minor: Number(minor) + 1, patch: 0, prerelease: [], build: [] }) },
    ];
  }
  return [{ op: "=", version: toSemVer(major, minor, patch, pre) }];
}

/** Parse one comparator token such as `>=1.2.3`, `^1.2.x`, `~1.2`, `1.2.x`. */
function parseComparatorToken(token: string): Comparator[] {
  let rest = token;
  let kind: "caret" | "tilde" | "op" | "bare" = "bare";
  let op: Op = "=";
  if (rest.startsWith("^")) {
    kind = "caret";
    rest = rest.slice(1);
  } else if (rest.startsWith("~")) {
    kind = "tilde";
    rest = rest.slice(1);
  } else {
    const m = /^(>=|<=|>|<|=)/.exec(rest);
    if (m) {
      kind = "op";
      op = m[1] as Op;
      rest = rest.slice(m[1].length);
    }
  }
  const match = PARTIAL.exec(rest);
  if (!match) {
    throw new RangeError(`invalid range comparator: ${JSON.stringify(token)}`);
  }
  const [, major, minor, patch, pre] = match;
  if (kind === "caret") return caretBounds(major, minor, patch, pre);
  if (kind === "tilde") return tildeBounds(major, minor, patch, pre);
  if (kind === "op") {
    if (isWildcard(major) || isWildcard(minor) || isWildcard(patch)) {
      // `=1.2.x` behaves like the bare partial form. Any other operator
      // over a wildcard (e.g. `>=x`) is meaningless and rejected.
      if (op === "=") return partialBounds(major, minor, patch, pre);
      throw new RangeError(`comparison operator over a wildcard: ${JSON.stringify(token)}`);
    }
    return [{ op, version: toSemVer(major, minor, patch, pre) }];
  }
  return partialBounds(major, minor, patch, pre);
}

/** Parse one `||`-separated alternative into a comparator set. */
function parseSet(text: string): ComparatorSet {
  const trimmed = text.trim();
  if (trimmed === "") throw new RangeError("empty range set");

  // Hyphen range: "a - b". Both ends are partial versions.
  const hyphen = /^(.+?)\s+-\s+(.+)$/.exec(trimmed);
  if (hyphen && !/^(>=|<=|>|<|=|\^|~)/.test(trimmed)) {
    const lo = PARTIAL.exec(hyphen[1].trim());
    const hi = PARTIAL.exec(hyphen[2].trim());
    if (!lo || !hi) throw new RangeError(`invalid hyphen range: ${JSON.stringify(trimmed)}`);
    const comparators: Comparator[] = [];
    if (!isWildcard(lo[1])) {
      comparators.push({ op: ">=", version: toSemVer(lo[1], lo[2], lo[3], lo[4]) });
    }
    if (!isWildcard(hi[1])) {
      if (isWildcard(hi[2])) {
        comparators.push({ op: "<", version: new SemVer({ major: Number(hi[1]) + 1, minor: 0, patch: 0, prerelease: [], build: [] }) });
      } else if (isWildcard(hi[3]) || hi[3] === undefined) {
        comparators.push({ op: "<", version: new SemVer({ major: Number(hi[1]), minor: Number(hi[2]) + 1, patch: 0, prerelease: [], build: [] }) });
      } else {
        comparators.push({ op: "<=", version: toSemVer(hi[1], hi[2], hi[3], hi[4]) });
      }
    }
    return { comparators, allowsPrerelease: comparators.some((c) => c.version.isPrerelease) };
  }

  const comparators: Comparator[] = [];
  for (const token of trimmed.split(/[\s,]+/).filter(Boolean)) {
    comparators.push(...parseComparatorToken(token));
  }
  if (comparators.length === 0) {
    // e.g. bare "*" — matches everything, no constraints.
    return { comparators: [], allowsPrerelease: false };
  }
  return { comparators, allowsPrerelease: comparators.some((c) => c.version.isPrerelease) };
}

function satisfiesSet(version: SemVer, set: ComparatorSet): boolean {
  if (version.isPrerelease) {
    const sameTriple = set.comparators.some(
      (c) =>
        c.version.isPrerelease &&
        c.version.major === version.major &&
        c.version.minor === version.minor &&
        c.version.patch === version.patch,
    );
    if (!sameTriple) return false;
  }
  return set.comparators.every((c) => {
    const cmp = version.compareTo(c.version);
    switch (c.op) {
      case ">=": return cmp >= 0;
      case "<=": return cmp <= 0;
      case ">": return cmp > 0;
      case "<": return cmp < 0;
      case "=": return cmp === 0;
    }
  });
}

export class Range {
  private readonly sets: ComparatorSet[];
  readonly raw: string;

  private constructor(raw: string, sets: ComparatorSet[]) {
    this.raw = raw;
    this.sets = sets;
  }

  static parse(input: string): Range {
    if (typeof input !== "string" || input.trim() === "") {
      throw new RangeError("range must be a non-empty string");
    }
    const sets = input.split("||").map((part) => parseSet(part));
    return new Range(input.trim(), sets);
  }

  static isValid(input: string): boolean {
    try {
      Range.parse(input);
      return true;
    } catch {
      return false;
    }
  }

  /** True if `version` satisfies any `||` alternative. */
  satisfies(version: string | SemVer): boolean {
    const parsed = typeof version === "string" ? SemVer.parse(version) : version;
    return this.sets.some((set) => satisfiesSet(parsed, set));
  }

  toString(): string {
    return this.raw;
  }
}

/** Convenience wrapper: does `version` satisfy `range`? */
export function satisfies(version: string, range: string): boolean {
  try {
    return Range.parse(range).satisfies(version);
  } catch (err) {
    if (err instanceof SemVerError || err instanceof RangeError) return false;
    throw err;
  }
}

/**
 * Highest version from `candidates` satisfying `range`, or null when
 * none does. Invalid candidates are skipped, not fatal.
 */
export function maxSatisfying(candidates: Iterable<string>, range: string): string | null {
  const parsed = Range.parse(range);
  let best: SemVer | null = null;
  for (const candidate of candidates) {
    let version: SemVer;
    try {
      version = SemVer.parse(candidate);
    } catch {
      continue;
    }
    if (!parsed.satisfies(version)) continue;
    if (best === null || version.compareTo(best) > 0) best = version;
  }
  return best === null ? null : best.toString();
}
