import { Range, satisfies, maxSatisfying } from "../src/range";

describe("exact and wildcard ranges", () => {
  test("exact match only", () => {
    expect(satisfies("1.2.3", "1.2.3")).toBe(true);
    expect(satisfies("1.2.4", "1.2.3")).toBe(false);
  });

  test("wildcards widen correctly", () => {
    expect(satisfies("1.2.9", "1.2.x")).toBe(true);
    expect(satisfies("1.3.0", "1.2.x")).toBe(false);
    expect(satisfies("1.9.9", "1.x")).toBe(true);
    expect(satisfies("2.0.0", "1.x")).toBe(false);
    expect(satisfies("9.9.9", "*")).toBe(true);
    expect(satisfies("1.2.9", "1.2")).toBe(true);
    expect(satisfies("1.3.0", "1.2")).toBe(false);
  });
});

describe("caret ranges", () => {
  test("^1.2.3 allows minor/patch changes, not a new major", () => {
    expect(satisfies("1.9.9", "^1.2.3")).toBe(true);
    expect(satisfies("2.0.0", "^1.2.3")).toBe(false);
    expect(satisfies("1.2.2", "^1.2.3")).toBe(false);
  });

  test("leading zero pins the left-most non-zero part", () => {
    expect(satisfies("0.2.9", "^0.2.3")).toBe(true);
    expect(satisfies("0.3.0", "^0.2.3")).toBe(false);
    expect(satisfies("0.0.3", "^0.0.3")).toBe(true);
    expect(satisfies("0.0.4", "^0.0.3")).toBe(false);
    expect(satisfies("0.0.9", "^0.0.x")).toBe(true);
    expect(satisfies("0.1.0", "^0.0.x")).toBe(false);
  });
});

describe("tilde ranges", () => {
  test("~1.2.3 allows patch changes only", () => {
    expect(satisfies("1.2.9", "~1.2.3")).toBe(true);
    expect(satisfies("1.3.0", "~1.2.3")).toBe(false);
  });

  test("~1.2 allows minor-level changes", () => {
    expect(satisfies("1.2.9", "~1.2")).toBe(true);
    expect(satisfies("1.3.0", "~1.2")).toBe(false);
    expect(satisfies("1.9.9", "~1")).toBe(true);
    expect(satisfies("2.0.0", "~1")).toBe(false);
  });
});

describe("comparators, hyphen ranges, alternation", () => {
  test("comparator sets are AND-ed", () => {
    expect(satisfies("1.5.0", ">=1.2.3 <2.0.0")).toBe(true);
    expect(satisfies("2.0.0", ">=1.2.3 <2.0.0")).toBe(false);
    expect(satisfies("1.2.2", ">=1.2.3 <2.0.0")).toBe(false);
  });

  test("hyphen ranges are inclusive", () => {
    expect(satisfies("1.2.3", "1.2.3 - 2.3.4")).toBe(true);
    expect(satisfies("2.3.4", "1.2.3 - 2.3.4")).toBe(true);
    expect(satisfies("2.3.5", "1.2.3 - 2.3.4")).toBe(false);
    expect(satisfies("2.3.9", "1.2 - 2.3")).toBe(true);
    expect(satisfies("2.4.0", "1.2 - 2.3")).toBe(false);
  });

  test("|| alternation", () => {
    expect(satisfies("2.0.0", "^1.0.0 || ^2.0.0")).toBe(true);
    expect(satisfies("3.0.0", "^1.0.0 || ^2.0.0")).toBe(false);
  });
});

describe("prerelease rule", () => {
  test("a bare caret range does not admit prereleases", () => {
    expect(satisfies("1.2.4-beta.1", "^1.2.3")).toBe(false);
  });

  test("an explicit prerelease comparator admits its own triple", () => {
    expect(satisfies("1.0.0-beta.2", ">=1.0.0-alpha <2.0.0")).toBe(true);
    expect(satisfies("1.5.0-beta.1", ">=1.0.0-alpha <2.0.0")).toBe(false);
  });
});

describe("maxSatisfying", () => {
  test("picks the highest satisfying version, skips invalid input", () => {
    expect(maxSatisfying(["1.2.3", "1.4.0", "2.0.0", "bogus"], "^1.0.0")).toBe("1.4.0");
    expect(maxSatisfying(["2.0.0"], "^1.0.0")).toBeNull();
  });

  test("invalid ranges throw, Range.isValid guards", () => {
    expect(() => Range.parse("")).toThrow();
    expect(() => Range.parse(">=x")).toThrow();
    expect(Range.isValid("^1.2.3")).toBe(true);
    expect(Range.isValid("not a range")).toBe(false);
  });
});
