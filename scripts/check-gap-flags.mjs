#!/usr/bin/env node
/**
 * check-gap-flags — the gap-flag half of the `verify-ui` gate (see
 * .claude/design-system.md "Gap-flag convention", KTD3/KTD4). Every real
 * <Unbacked> JSX site MUST carry an adjacent `TODO(stitch-gap)` comment naming
 * what's missing, so designed-but-unbacked UI stays greppable until real data
 * lands. This scans web/**\/*.tsx and fails loudly (file:line) on any
 * <Unbacked> that lacks a TODO(stitch-gap) marker within a few preceding lines.
 *
 * The <Unbacked> match runs on a comment-free view of each line, so an
 * <Unbacked> mentioned in prose/JSDoc never trips the rule — only real JSX
 * sites do. The TODO lookback runs on the RAW lines (the marker IS a comment).
 *
 * Exit 0 = clean, exit 1 = violations (printed verbatim). Node built-ins only,
 * no dependencies. Mirrors scripts/design-lint.mjs rule 4 from closecoach.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SCAN_DIR = join(ROOT, 'web')
// How many preceding lines an <Unbacked> site may carry its TODO(stitch-gap)
// marker on (room for a wrapping element or a prop spread above the tag).
const TODO_LOOKBACK = 4

/** Recursively list .tsx source files under `dir`, skipping node_modules. */
function sources(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules') continue
      out.push(...sources(p))
    } else if (name.endsWith('.tsx')) {
      out.push(p)
    }
  }
  return out
}

/**
 * Blank out `//` line comments and `/* *\/` block comments so an <Unbacked>
 * mentioned in a comment never trips the rule. Threads block-comment state
 * across lines via `inBlock`.
 * @param {string} line
 * @param {boolean} inBlock
 * @returns {{ code: string, inBlock: boolean }}
 */
function stripComments(line, inBlock) {
  let out = ''
  let i = 0
  while (i < line.length) {
    if (inBlock) {
      const end = line.indexOf('*/', i)
      if (end === -1) break
      inBlock = false
      i = end + 2
      continue
    }
    if (line.startsWith('//', i)) break
    if (line.startsWith('/*', i)) {
      inBlock = true
      i += 2
      continue
    }
    out += line[i]
    i += 1
  }
  return { code: out, inBlock }
}

/**
 * @param {string} [root] directory to scan (defaults to web/)
 * @returns {string[]} `file:line` locations of offending <Unbacked> sites
 */
export function findGapViolations(root = SCAN_DIR) {
  const violations = []
  for (const file of sources(root)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    let inBlock = false
    // Comment-free, line-aligned view used only to spot real JSX sites.
    const codeLines = lines.map((line) => {
      const { code, inBlock: next } = stripComments(line, inBlock)
      inBlock = next
      return code
    })
    lines.forEach((_, i) => {
      if (!/<Unbacked\b/.test(codeLines[i])) return
      const windowText = lines.slice(Math.max(0, i - TODO_LOOKBACK), i + 1).join('\n')
      if (!/TODO\(stitch-gap\)/.test(windowText)) {
        violations.push(`${relative(ROOT, file)}:${i + 1}`)
      }
    })
  }
  return violations
}

// Standalone CLI mode (skipped when imported by verify-ui.mjs).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = findGapViolations()
  if (violations.length) {
    console.error(
      `\n✖ check-gap-flags: ${violations.length} <Unbacked> site(s) missing a TODO(stitch-gap) marker:\n`,
    )
    for (const v of violations) console.error(`  ${v}  <Unbacked> without an adjacent TODO(stitch-gap)`)
    console.error(
      "\nEvery <Unbacked> needs an adjacent // TODO(stitch-gap): <what's missing> comment so gaps stay greppable (see .claude/design-system.md \"Gap-flag convention\").\n",
    )
    process.exit(1)
  }
  console.log('✓ check-gap-flags: clean (every <Unbacked> carries a TODO(stitch-gap) marker).')
}
