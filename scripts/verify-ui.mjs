#!/usr/bin/env node
// verify-ui (U5): single local gate composing typecheck + design lint (R9).
//
// Runs, sequentially, without fail-fast between steps so every violation
// class is visible in one run (plan requirement: "no fail-fast hiding"):
//   1. tsc --noEmit (root)      -- same as the `typecheck` npm script
//   1. tsc --noEmit -p web      -- same as the `typecheck` npm script
//   2. eslint web               -- same as the `lint:design` npm script
//   3. stylelint "web/**/*.css" -- same as the `lint:style` npm script
//   4. check-gap-flags          -- same as the `lint:gaps` npm script
//
// Each tool's native output is normalized into one line per violation:
//   file:line rule message (hint: ...)
// ESLint and Stylelint are invoked with their JSON formatters (cheaper and
// more reliable to normalize than parsing their human-readable text); tsc
// has no JSON output mode, so its `--pretty false` text output is parsed
// with a regex instead.
//
// Exits non-zero if any step reported a violation or a tool crashed; exits
// 0 with a short success line + runtime otherwise. No new dependencies.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findGapViolations } from "./check-gap-flags.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BIN = path.join(ROOT, "node_modules", ".bin");
const MAX_BUFFER = 20 * 1024 * 1024;

const startedAt = Date.now();

/** @type {string[]} */
const violationLines = [];
let anyStepFailed = false;

/**
 * @param {string} location file:line
 * @param {string} rule
 * @param {string} message
 * @param {string} hint
 */
function reportViolation(location, rule, message, hint) {
  const cleanMessage = message.replace(/\s+/g, " ").trim();
  violationLines.push(`${location} ${rule} ${cleanMessage} (hint: ${hint})`);
}

function toRelative(absoluteOrRelativePath) {
  return path.isAbsolute(absoluteOrRelativePath)
    ? path.relative(ROOT, absoluteOrRelativePath)
    : absoluteOrRelativePath;
}

// ---------------------------------------------------------------------------
// Step 1: typecheck (tsc --noEmit, root config + web config)
// ---------------------------------------------------------------------------

// tsc's default (non-pretty, non-TTY) text format:
//   path/to/file.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.
const TSC_ERROR_RE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/;

function runTsc(label, extraArgs) {
  const result = spawnSync(path.join(BIN, "tsc"), ["--noEmit", "--pretty", "false", ...extraArgs], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });

  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const lines = output.split("\n").filter((line) => line.trim().length > 0);

  let matchedAnyError = false;
  for (const line of lines) {
    const match = line.match(TSC_ERROR_RE);
    if (!match) continue;
    matchedAnyError = true;
    const [, file, ln, , code, message] = match;
    reportViolation(`${toRelative(file)}:${ln}`, code, message, "fix the reported type error");
  }

  const failed = result.status !== 0;
  if (failed && !matchedAnyError) {
    // tsc failed but produced output we couldn't parse as TSxxxx errors
    // (crash, config error, etc.) -- surface it instead of hiding it.
    reportViolation(
      label,
      "tsc",
      output.trim().length > 0 ? output.trim() : `tsc exited with status ${result.status}`,
      "run the failing tsc invocation directly to debug",
    );
  }
  return failed;
}

const typecheckRootFailed = runTsc("typecheck (root tsconfig.json)", []);
const typecheckWebFailed = runTsc("typecheck (web/tsconfig.json)", ["-p", "web"]);
anyStepFailed = anyStepFailed || typecheckRootFailed || typecheckWebFailed;

// ---------------------------------------------------------------------------
// Step 2: ESLint design lint (same target as `lint:design`)
// ---------------------------------------------------------------------------

const ESLINT_HINTS = {
  "better-tailwindcss/no-unknown-classes":
    "register the class in the @theme block in web/index.css, or fix the typo",
  "better-tailwindcss/no-restricted-classes":
    "use a --color-* token from web/index.css instead of an arbitrary color value",
  "better-tailwindcss/no-conflicting-classes": "remove the conflicting Tailwind class",
};
const DEFAULT_ESLINT_HINT = "use a --color-* token from web/index.css";
const DEFAULT_STYLELINT_HINT = "use a var(--color-*) token from web/index.css";

/**
 * Shared runner for the JSON-formatter lint tools (ESLint, Stylelint):
 * spawn, parse JSON output, report violations via the tool-specific
 * `reportResults` callback, and surface crashes (unparseable output or a
 * non-zero exit with no reported violations) as violations instead of
 * swallowing them.
 *
 * @param {string} toolLabel  name used in crash-fallback violation lines
 * @param {string} bin        binary name inside node_modules/.bin
 * @param {string[]} args     CLI args (must select a JSON output format)
 * @param {string} debugCmd   npm script the fix hint tells the user to run
 * @param {(fileResults: any[]) => boolean} reportResults
 *        walks parsed JSON, calls reportViolation per finding, returns
 *        whether any violation was reported
 */
function runJsonTool(toolLabel, bin, args, debugCmd, reportResults) {
  const result = spawnSync(path.join(BIN, bin), args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });

  // ESLint's JSON formatter writes to stdout; Stylelint 17's writes to
  // stderr in both the clean and violation cases (confirmed empirically).
  // Prefer stdout when populated, fall back to stderr.
  const rawOutput = (result.stdout && result.stdout.trim().length > 0 ? result.stdout : result.stderr) || "[]";
  let fileResults;
  try {
    fileResults = JSON.parse(rawOutput);
  } catch (err) {
    reportViolation(
      toolLabel,
      toolLabel,
      `failed to parse ${toolLabel} JSON output: ${err.message}. raw: ${rawOutput.slice(0, 500)}`,
      `run \`${debugCmd}\` directly to debug`,
    );
    return true;
  }

  let failed = reportResults(fileResults);

  // Defensive: a non-zero exit with no parsed messages means the tool itself
  // crashed (config error, etc.) rather than reporting lint violations.
  if (result.status !== 0 && !failed) {
    failed = true;
    reportViolation(
      toolLabel,
      toolLabel,
      (result.stderr || `${toolLabel} exited non-zero with no reported messages`).trim(),
      `run \`${debugCmd}\` directly to debug`,
    );
  }
  return failed;
}

const eslintFailed = runJsonTool(
  "eslint",
  "eslint",
  ["web", "--format", "json"],
  "npm run lint:design",
  (fileResults) => {
    let failed = false;
    for (const fileResult of fileResults) {
      const relPath = toRelative(fileResult.filePath);
      for (const message of fileResult.messages || []) {
        if (message.severity < 1) continue;
        failed = true;
        const rule = message.ruleId || "eslint";
        const hint = ESLINT_HINTS[rule] || DEFAULT_ESLINT_HINT;
        reportViolation(`${relPath}:${message.line}`, rule, message.message, hint);
      }
    }
    return failed;
  },
);
anyStepFailed = anyStepFailed || eslintFailed;

// ---------------------------------------------------------------------------
// Step 3: Stylelint design lint (same target as `lint:style`)
// ---------------------------------------------------------------------------

const stylelintFailed = runJsonTool(
  "stylelint",
  "stylelint",
  ["web/**/*.css", "--formatter", "json", "--allow-empty-input"],
  "npm run lint:style",
  (fileResults) => {
    let failed = false;
    for (const fileResult of fileResults) {
      if (fileResult.ignored) continue;
      const relPath = toRelative(fileResult.source);
      for (const warning of fileResult.warnings || []) {
        failed = true;
        reportViolation(`${relPath}:${warning.line}`, warning.rule, warning.text, DEFAULT_STYLELINT_HINT);
      }
    }
    return failed;
  },
);
anyStepFailed = anyStepFailed || stylelintFailed;

// ---------------------------------------------------------------------------
// Step 4: gap-flag grep gate (same target as `lint:gaps`). Every <Unbacked>
// JSX site must carry an adjacent TODO(stitch-gap) marker (KTD3/KTD4) so
// designed-but-unbacked UI stays greppable.
// ---------------------------------------------------------------------------

let gapCheckFailed = false;
try {
  for (const location of findGapViolations()) {
    gapCheckFailed = true;
    reportViolation(
      location,
      "unbacked-without-todo",
      "<Unbacked> site missing an adjacent TODO(stitch-gap) marker",
      "add a // TODO(stitch-gap): <what's missing> comment next to the <Unbacked> tag",
    );
  }
} catch (err) {
  gapCheckFailed = true;
  reportViolation(
    "scripts/check-gap-flags.mjs",
    "lint:gaps",
    err.message,
    "run `npm run lint:gaps` directly to debug",
  );
}
anyStepFailed = anyStepFailed || gapCheckFailed;

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const runtimeSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

if (anyStepFailed) {
  console.log(`verify-ui: ${violationLines.length} violation(s) found\n`);
  for (const line of violationLines) {
    console.log(line);
  }
  console.log(`\nverify-ui failed in ${runtimeSeconds}s`);
  process.exit(1);
} else {
  console.log(`verify-ui passed (typecheck + lint:design + lint:style + lint:gaps clean) in ${runtimeSeconds}s`);
  process.exit(0);
}
