#!/usr/bin/env node
/**
 * semver CLI:
 *   semver compare <a> <b>            print -1, 0, or 1
 *   semver satisfies <version> <range> print yes/no, exit 0/1
 *   semver sort <v...>                print versions ascending, one per line
 *   semver max <range> <v...>         print highest satisfying version or "none"
 */
import { SemVer, compare, sortVersions } from "./index";
import { Range, maxSatisfying } from "./index";

function usage(): never {
  console.error(
    "Usage:\n" +
      "  semver compare <a> <b>\n" +
      "  semver satisfies <version> <range>\n" +
      "  semver sort <v...>\n" +
      "  semver max <range> <v...>",
  );
  process.exit(2);
}

const [, , command, ...args] = process.argv;

try {
  switch (command) {
    case "compare": {
      if (args.length !== 2) usage();
      console.log(compare(args[0], args[1]));
      break;
    }
    case "satisfies": {
      if (args.length !== 2) usage();
      const ok = Range.parse(args[1]).satisfies(SemVer.parse(args[0]));
      console.log(ok ? "yes" : "no");
      process.exit(ok ? 0 : 1);
      break;
    }
    case "sort": {
      if (args.length === 0) usage();
      for (const v of sortVersions(args)) console.log(v);
      break;
    }
    case "max": {
      if (args.length < 2) usage();
      const best = maxSatisfying(args.slice(1), args[0]);
      console.log(best ?? "none");
      break;
    }
    default:
      usage();
  }
} catch (err) {
  console.error(`error: ${(err as Error).message}`);
  process.exit(1);
}
