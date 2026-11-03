import { SemVer, compare, sortVersions } from "../src/semver";

describe("SemVer.parse", () => {
  test("parses a plain version", () => {
    const v = SemVer.parse("1.2.3");
    expect([v.major, v.minor, v.patch]).toEqual([1, 2, 3]);
    expect(v.prerelease).toEqual([]);
    expect(v.toString()).toBe("1.2.3");
  });

  test("accepts a leading v and preserves prerelease/build", () => {
    const v = SemVer.parse("v1.0.0-alpha.1+build.5");
    expect(v.prerelease).toEqual(["alpha", "1"]);
    expect(v.build).toEqual(["build", "5"]);
    expect(v.toString()).toBe("1.0.0-alpha.1+build.5");
  });

  test.each(["1.2", "1.2.3.4", "01.2.3", "1.02.3", "1.2.3-", "1.2.3-alpha..1", "1.2.3-01", "", "v", "a.b.c"])(
    "rejects %p",
    (input) => {
      expect(() => SemVer.parse(input)).toThrow();
      expect(SemVer.isValid(input)).toBe(false);
    },
  );
});

describe("precedence (semver spec section 11 examples)", () => {
  test("orders the spec's canonical chain", () => {
    const chain = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ];
    expect(sortVersions([...chain].reverse())).toEqual(chain);
  });

  test("numeric prerelease identifiers sort before alphanumeric ones", () => {
    expect(compare("1.0.0-1", "1.0.0-alpha")).toBe(-1);
    expect(compare("1.0.0-beta.2", "1.0.0-beta.11")).toBe(-1);
  });

  test("build metadata does not affect precedence", () => {
    expect(compare("1.0.0+build.1", "1.0.0+build.2")).toBe(0);
    expect(compare("1.0.0+a", "1.0.0")).toBe(0);
  });

  test("core fields dominate prerelease", () => {
    expect(compare("2.0.0-alpha", "1.9.9")).toBe(1);
    expect(compare("1.0.0", "1.0.0-rc.99")).toBe(1);
  });
});
