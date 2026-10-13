// Tests for `win-shell-args.mjs` (inspector#1939). The platform is a parameter rather
// than a read of `process.platform`, so the Windows behaviour is exercised on
// the Linux/macOS machines that actually run this suite — otherwise every
// assertion below would be skipped exactly where the bug lives.

import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteWinArg, winShellArgs } from "./win-shell-args.mjs";

test("passes args through untouched off Windows", () => {
  const args = ["pack", "--pack-destination", "/tmp/dir with spaces"];
  assert.deepEqual(winShellArgs(args, "linux"), args);
  assert.deepEqual(winShellArgs(args, "darwin"), args);
});

test("quotes a path with a space (the user-profile tmpdir case)", () => {
  assert.equal(
    quoteWinArg("C:\\Users\\First Last\\AppData\\Local\\Temp"),
    '"C:\\Users\\First Last\\AppData\\Local\\Temp"',
  );
});

test("quotes cmd.exe metacharacters, parentheses included", () => {
  // Parentheses group in cmd.exe, so `C:\Temp(1)` is syntax, not a path — the
  // case a space-only predicate misses.
  for (const meta of ["(", ")", "&", "|", "<", ">", "^", "!", ";", ",", "="]) {
    const arg = `C:\\Temp${meta}1`;
    assert.equal(quoteWinArg(arg), `"${arg}"`, `unquoted: ${arg}`);
  }
});

test("leaves an inert argument unquoted", () => {
  for (const arg of ["pack", "--json", "C:\\Users\\dev\\AppData\\Temp"]) {
    assert.equal(quoteWinArg(arg), arg);
  }
});

test("doubles an embedded quote", () => {
  assert.equal(quoteWinArg('a"b c'), '"a""b c"');
});

test("doubles a trailing backslash run, which the closing quote follows (#5111)", () => {
  // Undoubled, `"C:\dir with space\"` ends in `\"`, an escaped quote, and the
  // CRT parser runs the argument on into the next one.
  assert.equal(quoteWinArg("C:\\a b\\"), '"C:\\a b\\\\"');
  assert.equal(quoteWinArg("C:\\a b\\\\"), '"C:\\a b\\\\\\\\"');
});

test("doubles backslashes before an embedded quote, then doubles the quote", () => {
  assert.equal(quoteWinArg('a\\"b c'), '"a\\\\""b c"');
  assert.equal(quoteWinArg('a\\\\"b'), '"a\\\\\\\\""b"');
});

test("leaves backslashes not followed by a quote alone", () => {
  assert.equal(quoteWinArg("C:\\a b\\c"), '"C:\\a b\\c"');
  // An inert trailing-backslash path is not quoted, so nothing follows it.
  assert.equal(quoteWinArg("C:\\dir\\"), "C:\\dir\\");
});

test("quoted output parses back to the original under the CRT rules", () => {
  // A reference parser for one quoted argument (the MSVCRT 2008+ rules), so
  // the expectations above are checked against what the child actually sees.
  const parse = (s) => {
    let out = "";
    let inQuotes = false;
    for (let i = 0; i < s.length; ) {
      let n = 0;
      while (s[i] === "\\") {
        n++;
        i++;
      }
      if (s[i] === '"') {
        out += "\\".repeat(n >> 1);
        if (n & 1) {
          out += '"';
        } else if (inQuotes && s[i + 1] === '"') {
          out += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        i++;
      } else {
        out += "\\".repeat(n);
        if (i < s.length) out += s[i++];
      }
    }
    return out;
  };
  for (const arg of [
    "C:\\a b\\",
    "C:\\a b\\\\",
    'a\\"b c',
    'a\\\\"b',
    'a"b c',
    '"',
    "\\ \\",
    "C:\\Temp(1)\\",
  ]) {
    assert.equal(parse(quoteWinArg(arg)), arg, `round trip: ${arg}`);
  }
});

test("throws on `%` rather than silently mis-expanding it", () => {
  // cmd.exe expands %NAME% before it processes quotes, so quoting cannot save
  // this one — the child would receive a different path than we passed.
  assert.throws(() => quoteWinArg("C:\\%TEMP%\\pack"), /cannot safely pass/);
  assert.throws(() => winShellArgs(["ok", "%X%"], "win32"), /cannot safely/);
});

test("winShellArgs maps every element on win32", () => {
  assert.deepEqual(
    winShellArgs(["pack", "--pack-destination", "C:\\a b\\c"], "win32"),
    ["pack", "--pack-destination", '"C:\\a b\\c"'],
  );
});
