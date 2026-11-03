# typescript-semver

Strict Semantic Versioning 2.0.0 parsing, comparison, and npm-style range
matching in TypeScript — with zero runtime dependencies.

Every package manager, release tool, and dependency resolver eventually needs
to answer three questions: *is this version well-formed?*, *which of these two
versions is newer?*, and *does this version satisfy that range?* This library
answers all three from first principles instead of wrapping the `semver`
package, so the parsing and precedence rules are visible, testable code
rather than a black box.

## What it does

- **Parse** versions strictly per semver 2.0.0: leading zeroes in core fields
  and numeric prerelease identifiers are rejected, build metadata is kept
  but never affects precedence.
- **Compare** versions with the spec's exact prerelease rules (numeric
  identifiers sort before alphanumeric ones; a release outranks its own
  prereleases; a shorter identifier list loses when it is a prefix).
- **Match ranges** in npm style: exact versions, wildcards (`1.2.x`, `1.x`,
  `*`), caret (`^1.2.3`), tilde (`~1.2.3`), comparators (`>=1.2.3 <2.0.0`),
  hyphen ranges (`1.2.3 - 2.3.4`), and `||` alternation.
- **Resolve** the highest satisfying version from a candidate list with
  `maxSatisfying` (invalid candidates are skipped, not fatal).

## Design decisions

1. **No runtime dependencies.** Version logic is small and correctness
   critical; depending on a package for it would hide exactly the rules
   this project exists to implement and test.
2. **Ranges compile to comparator bounds.** Every range form (`^`, `~`,
   wildcards, hyphen ranges) is lowered to the same `>= lower, < upper`
   comparator pairs, so matching is one uniform code path and each range
   form is independently unit-testable.
3. **npm's prerelease gate.** A prerelease version only satisfies a range
   when a comparator in the same set carries a prerelease with the same
   `MAJOR.MINOR.PATCH`. Without this, `^1.2.3` would silently admit
   `1.3.0-beta.1` — the classic surprise in naive range matchers.
4. **Fail loud on parse, lenient on resolve.** `SemVer.parse` and
   `Range.parse` throw descriptive errors; `maxSatisfying` skips malformed
   candidates because a resolver should not die on one bad tag.

## Usage

```ts
import { SemVer, compare, satisfies, maxSatisfying } from "./src";

SemVer.parse("v1.0.0-alpha.1+build.5").toString(); // "1.0.0-alpha.1+build.5"
compare("1.0.0-beta.11", "1.0.0-beta.2");           // 1
satisfies("1.4.0", "^1.2.3");                        // true
satisfies("2.0.0", "^1.2.3");                        // false
satisfies("0.2.9", "^0.2.3");                        // true  (0.x pins minor)
satisfies("0.3.0", "^0.2.3");                        // false
maxSatisfying(["1.2.3", "1.4.0", "2.0.0"], "^1.0.0"); // "1.4.0"
```

## CLI

```sh
npm run build
node dist/cli.js compare 1.0.0-beta.11 1.0.0-beta.2   # 1
node dist/cli.js satisfies 1.4.0 "^1.2.3"             # yes
node dist/cli.js sort 2.0.0 1.0.0-rc.1 1.0.0
node dist/cli.js max "^1.0.0" 1.2.3 1.4.0 2.0.0      # 1.4.0
```

## How to run

```sh
npm install
npm run build
```

## How to run tests

```sh
npm test
```

The suite covers the semver spec's canonical precedence chain, the
leading-zero rejections, every range form, the caret rules for `0.x`
versions, and the prerelease gate.

## Tech stack

TypeScript (strict mode), Jest + ts-jest, Node.js. No runtime dependencies.
