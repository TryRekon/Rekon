---
name: design-orchestrator
description: |
  End-to-end UI generation from a prompt and design system. Generates code,
  takes screenshots, reviews against your design system, and iterates until
  the result passes review or hits a max iteration cap.
  Use when: "build this UI", "implement this screen", "generate this page",
  or any request to create frontend UI that should match a design system.
argument-hint: "<prompt> [--iterations N] [--design-system path]"
user-invocable: true
---

# Design Orchestrator

Generate UI from a prompt + design system, then iterate with screenshot-based
review until the implementation matches your design system's rules.

## Overview

This skill orchestrates a generate → deterministic gate → screenshot → visual
review loop. Deterministic, machine-checkable issues (tokens, imports, prop
types, lint/format rules) are resolved first and cheaply, before any pixel is
ever judged by an LLM:

```
Load Design System → Generate UI → Deterministic Gate → Pass? → Screenshot → Visual Review → Pass? → Done
                                          ↑ Fail                                    ↓ Fail
                                    Feed back verbatim,                    Feed back → Re-generate
                                    Re-generate (loop)                     (loop, or escalate if unsure)
```

The deterministic gate runs first and loops on its own (cheap, ~1.5s per
attempt) — the visual review loop only starts once code is already clean by
every mechanical measure, so the LLM is never spent judging code that doesn't
even typecheck or lint.

## Arguments

- `<prompt>`: What to build (e.g., "a pricing page with three tiers")
- `--iterations N`: Max **visual review** fix cycles (default: 3 — see Phase 0
  for why this is smaller than the deterministic loop's cap)
- `--design-system path`: Path to design system doc (default: `.claude/design-system.md`)
- `--url`: Dev server URL to screenshot (default: auto-detect from framework)
- `--target`: CSS selector or description of the element to screenshot (default: full page)

## Instructions

Follow these phases in order. Do NOT skip phases.

---

### Phase 0: Parse Arguments

Extract from ARGUMENTS:
- `prompt`: The UI to build (everything before flags)
- `visual_max_iterations`: From `--iterations` flag, default 3
- `design_system_path`: From `--design-system` flag, default `.claude/design-system.md`
- `url`: From `--url` flag, or detect from dev server
- `target`: From `--target` flag, or full viewport

Also derive:
- `deterministic_max_iterations`: fixed at 5 (not user-configurable via a flag).

**Why two separate caps instead of one shared budget**: the deterministic gate
(Phase 3) is mechanical and fast (~1.5s per run) — a wrong fix there just costs
a re-run, so it gets a generous fixed cap. The visual review loop (Phase 5-6)
is expensive (LLM judgment + screenshot capture) and its findings are
subjective, so it keeps the smaller, user-configurable `--iterations` budget.
Most mechanical issues now get caught and fixed before a screenshot is ever
taken, so the visual loop should need fewer cycles than it did before this
gate existed.

Also detect gate availability (used in Phase 3):
- Check `package.json` scripts for `verify-ui`.
- If absent, check for `typecheck` and/or `lint` scripts as a fallback.
- If none exist, note that the deterministic gate will be skipped.

---

### Phase 1: Load Design System

The design system is your source of truth. It contains tokens, component patterns,
visual rules, and possibly reference images/mocks.

1. **Check for design system doc** at the resolved path
   - If it exists: Read it entirely. This is your constraint document.
   - If it does NOT exist: Tell the user no design system was found and ask if they
     want to run `/design-system extract` first, or provide a path.

2. **Extract actionable constraints** from the design system into a structured checklist:

```markdown
## Design System Constraints (for generation — mechanical items below are *enforced* by the Phase 3 gate, not re-judged in Phase 5)

### Colors
- [ ] Only uses colors from the defined palette
- [ ] Primary color is [X], used for CTAs and key actions
- [ ] Semantic colors used correctly (success, error, warning)
- [ ] No hardcoded hex values outside the palette

### Typography
- [ ] Uses only defined font families
- [ ] Heading sizes follow the type scale
- [ ] Font weights match defined tokens
- [ ] Line heights and letter spacing match

### Spacing
- [ ] Uses spacing scale values (not arbitrary)
- [ ] Component padding follows patterns
- [ ] Section gaps follow defined rhythm

### Components
- [ ] Buttons match defined variant patterns
- [ ] Cards match defined card patterns
- [ ] Form inputs match defined patterns
- [ ] Interactive states (hover, focus, active) follow system

### Layout
- [ ] Container max-width matches system
- [ ] Grid/flex patterns match defined layouts
- [ ] Responsive breakpoints follow system

### Visual Style
- [ ] Border radius values from defined tokens
- [ ] Shadow values from defined tokens
- [ ] Transitions/animations follow defined durations
```

Adapt this checklist based on what the actual design system document contains.
If the design system includes visual mocks, reference images, or mood boards,
note their paths — you will compare against them during review.

3. **Check for reference images/mocks** in the design system or nearby:
   - Look for image files referenced in the design system doc
   - Look in `.claude/design-system/mocks/`, `design/`, `mocks/`, or similar
   - If reference images exist, read them — you will use them for visual comparison

---

### Phase 2: Generate Initial UI

Now build the UI. You are acting as the coder agent.

1. **Plan the structure** before writing code:
   - What components are needed?
   - How do they map to design system component patterns?
   - What's the layout structure?

2. **Write the code** following these rules:
   - Use the design system's tokens — never hardcode values that exist as tokens
   - Use the design system's component patterns as the base
   - Match the typography scale exactly
   - Use the spacing scale for all padding, margin, and gap values
   - Follow the layout patterns defined in the system

3. **Apply the prompt's intent**: Build exactly what was asked for, styled
   according to the design system. The prompt describes WHAT to build;
   the design system describes HOW it should look.

4. **Start the dev server** if not already running:
   - Detect the framework (check package.json scripts for `dev`, `start`, etc.)
   - Run the appropriate dev command in the background
   - Wait for it to be ready

---

### Phase 3: Deterministic Gate

Before anything gets screenshotted or judged visually, run the project's
deterministic checks. These catch everything a linter, typechecker, or
formatter can decide mechanically — token misuse, hardcoded values outside
the palette, invalid imports, prop-type errors, syntax errors — far more
cheaply and reliably than an LLM eyeballing a screenshot ever could.

1. **Resolve the gate command**, using the detection from Phase 0:
   - If the project provides a `verify-ui` (or equivalent) command — check
     `package.json` scripts and `.claude/design-system.md` for a documented
     command — use it. This is the flagship path: a single fast check (often
     combining typecheck + design-scoped lint/stylelint) that exits non-zero
     on violation and prints plain-text `file:line rule message (hint: ...)`
     lines.
   - If no such command exists, fall back to whatever the project provides:
     `typecheck`/`tsc --noEmit` and/or `lint` scripts, run individually.
   - If neither exists, **skip this phase** — there is no deterministic gate
     available. Note this explicitly in the Phase 7 final report so the user
     knows visual review is carrying more weight than usual.

2. **Run the resolved command(s).**

3. **Decision gate**:
   - Exit code 0 → gate PASSES. Proceed to Phase 4 (Screenshot).
   - Non-zero exit → gate FAILS. Capture the command's output **verbatim** —
     do not summarize, paraphrase, or selectively quote it. The output is
     already terse and each line carries a fix hint; summarizing throws that
     away.

4. **On failure**, run the fix loop below. Do not screenshot or invoke visual
   review while the gate is failing — there is no point judging the pixels of
   code that doesn't even typecheck or lint clean.

#### Deterministic Fix Loop

1. Read the gate's verbatim output from step 3.
2. Fix every reported line. Each hint should point directly at the
   token/pattern to use instead of what's flagged.
3. Do not touch code the gate didn't flag.
4. Increment the deterministic iteration counter and re-run from step 2 of
   Phase 3 (re-run the gate command).
5. **Iteration cap**: `deterministic_max_iterations` (default 5, see Phase 0
   for rationale). If the cap is hit and the gate is still failing, stop and
   escalate to the user with the last verbatim gate output — do not proceed
   to a screenshot of code known to be broken.

---

### Phase 4: Screenshot

Only runs once the deterministic gate (Phase 3) has passed, or was skipped
because the project has no gate command.

Capture the current state of the implementation.

```bash
# Open the page
agent-browser open [url]

# If targeting a specific element:
agent-browser snapshot -i
agent-browser scrollintoview @[ref]

# Take screenshot
agent-browser screenshot /tmp/design-orchestrator-iteration-0.png
```

Read the screenshot image to see what was rendered.

If reference mocks/images exist from Phase 1, read those too for side-by-side
comparison.

---

### Phase 5: Visual Design Review

This is the LLM judgment gate. It only runs on code that already passed the
deterministic gate (Phase 3), so it must NOT re-check anything a linter or
typechecker can already decide — that would be duplicate, weaker coverage of
work the gate already did. You are now the reviewer agent, scoped strictly to
what a screenshot can tell you that reading the code cannot.

**Explicit non-overlap with the deterministic gate**: do NOT evaluate token
usage, hardcoded values, import validity, or prop validity — those are
`verify-ui` (or the fallback typecheck/lint)'s job, not yours. If a finding
would read as "uses a hardcoded hex" or "invalid prop," that's a gate miss to
flag separately, not a Phase 5 rubric result — don't fail the visual review
on it.

**Rubric** — the only things this phase evaluates, because they're exactly
what deterministic tooling cannot see:

| Criterion | What to look for |
|---|---|
| Visual hierarchy | Primary action/content draws the eye first; heading/body/caption levels read as distinct and correctly ordered |
| Spacing rhythm | Gaps between related elements feel intentional and consistent; grouped items read as groups |
| Alignment | Edges line up; nothing is off-grid or eyeballed |
| Density fit | Information density matches the design system's stated density (compact/comfortable/spacious) and the screen's purpose |
| Dark-mode coherence | If dark mode applies, contrast and legibility hold up and colors read as the same system, not an inverted afterthought |
| Reference fidelity | Matches the project's design-system reference (e.g. `.claude/design-system/reference.html`) and any mocks or golden examples (e.g. `.claude/design-system/mocks/*.png`, `web/design-system/examples/*.tsx`) closely enough to be recognizable as the same system |

If reference mocks/images or golden examples exist, read them for a direct
side-by-side comparison — don't rely on memory of the design system doc alone.

**Output format** — structured, per-criterion, side-by-side against the
reference. Not free-form critique:

```markdown
## Visual Review — Iteration N/Max

| Criterion | Verdict | Confidence | Reason |
|---|---|---|---|
| Visual hierarchy | PASS | confident | CTA is the largest, highest-contrast element; body text recedes correctly |
| Spacing rhythm | FAIL | confident | Card internal padding reads tighter than the 16px used in reference.html cards |
| Alignment | PASS | confident | All columns align to the 12-col grid |
| Density fit | FAIL | unsure | Feels denser than the dashboard-card golden example, but hard to confirm without a direct overlay |
| Dark-mode coherence | PASS | confident | Contrast holds, no inverted-afterthought colors |
| Reference fidelity | PASS | confident | Matches reference.html card treatment |

### Overall Verdict: FAIL (1 confident fail, 1 unsure fail)
```

Rules for filling this in:
- One row per rubric criterion, every time — mark it PASS with a reason
  rather than omitting a row that seems fine.
- **Confidence**: mark each verdict `confident` or `unsure`. Use `unsure`
  when the screenshot is ambiguous, the reference doesn't clearly cover this
  case, or the verdict is inferred rather than directly observed.
- **Conflict rule**: if a fix you're tempted to suggest would contradict the
  deterministic gate (e.g. "use a softer gray" expressed as a raw hex), you
  may not suggest the raw value — express it in token vocabulary instead
  (e.g. "use `--color-neutral-400` instead of `--color-neutral-500`"). The
  gate always wins; this review points at tokens, never introduces
  untokenized values.
- Keep findings inside the table plus its one-line reasons — no free-form
  prose critique alongside it.
- **Prompt fulfillment** (does the build match what was asked for) is still
  worth checking but is separate from the rubric — call it out below the
  table if it's an issue, it isn't one of the six scored criteria.

### Decision Gate

- **All criteria PASS** → Go to Phase 7 (Done). If any PASS was marked
  `unsure`, list those rows explicitly in the final report's Remaining
  Issues so a low-confidence pass is visible to the human, never silent.
- **One or more criteria FAIL, and every failure is `confident`**, AND
  visual iterations remain → Go to Phase 6 (visual fix loop).
- **Any criterion FAILs with `unsure`**, or overall confidence is low →
  **escalate to the human** instead of looping or silently passing. Present
  the table and ask for a decision. Do not spend an iteration guessing, and
  do not pass a criterion just because you're unsure it's actually wrong.
- **FAIL and no visual iterations remain** → Go to Phase 7 with a note about
  remaining issues.

---

### Phase 6: Fix and Re-iterate (Visual Loop)

You are the coder agent again, but now with specific rubric feedback. This
loop only handles visual-review findings — deterministic issues are handled
entirely inside Phase 3's own loop and should never reach here.

1. **Read the review** from Phase 5 carefully
2. **Fix confident FAILs**, expressed in token vocabulary per the conflict
   rule above
3. **Do NOT change things that passed** — only fix what was flagged
4. **Increment the visual iteration counter**
5. **Go back to Phase 4** (Screenshot → Review → Decision). Note: code
   changes here can reintroduce deterministic violations (e.g. a typo'd
   token name) — if Phase 4's screenshot step fails to render, fall back to
   Phase 3 before re-screenshotting.

Important:
- Make targeted fixes, not wholesale rewrites
- Each iteration should address the specific feedback given
- If you find yourself going in circles (fixing A breaks B, fixing B breaks A),
  stop and address both issues together in a single pass
- Keep a running log of what was changed each iteration
- **Iteration cap**: `visual_max_iterations` (default 3, see Phase 0 for
  rationale)

---

### Phase 7: Final Report

Summarize the result:

```markdown
## Design Orchestrator — Complete

**Prompt**: [what was requested]
**Deterministic Gate**: used (verify-ui | typecheck+lint fallback | skipped — none available) — N/Max iterations used
**Visual Review**: N/Max iterations used
**Final Verdict**: PASS | PARTIAL (with remaining issues) | ESCALATED (unsure/low-confidence findings)

### What Was Built
- [Brief description of components/pages created]

### Files Modified
- [list of files created or changed]

### Deterministic Gate Results
- Command used: [verify-ui | typecheck/lint fallback | none available]
- Final status: [PASS | FAIL — cap hit]

### Visual Review Rubric Results
- Visual hierarchy: [status]
- Spacing rhythm: [status]
- Alignment: [status]
- Density fit: [status]
- Dark-mode coherence: [status]
- Reference fidelity: [status]

### Remaining Issues (if any)
- [Issues that weren't resolved within the iteration cap, or that were
  escalated to the human as unsure]
```

---

## Edge Cases

- **No dev server**: If you can't start a dev server, create a static HTML file
  and open it directly with `agent-browser open file:///path/to/file.html`
- **Screenshot fails**: Check if the URL is correct, the server is running, and
  the page has rendered. Retry once after a 2-second wait.
- **Design system is vague**: If the design system lacks specific tokens (e.g.,
  no defined spacing scale), note this in the review and use sensible defaults
  that are internally consistent.
- **Circular fixes**: If iteration N undoes what iteration N-1 fixed, address
  both concerns together rather than ping-ponging. This applies within each
  loop separately — a deterministic ping-pong and a visual ping-pong are
  different problems, don't conflate them.
- **Large pages**: Use `--target` to focus on a specific section rather than
  screenshotting the entire page.
- **No deterministic gate available**: If the project has no `verify-ui`,
  `typecheck`, or `lint` script, skip Phase 3 entirely and go straight from
  Phase 2 to Phase 4. Say so plainly in the final report — visual review is
  now the only safety net, so treat its findings as higher-stakes than usual.
- **Deterministic gate cap hit**: Stop and escalate with the verbatim last
  gate output rather than screenshotting code known to be broken.
- **Visual review returns any `unsure` verdict**: Escalate to the human
  immediately rather than looping or guessing — see the Phase 5 Decision Gate.
  Never resolve an `unsure` fail by silently marking it PASS to keep the loop
  moving.

## Tips

- The design system doc doesn't need to be machine-formatted — it can contain
  prose descriptions, mood boards, reference screenshots, and written rules.
  This skill's job is to interpret all of that and enforce it.
- If the user has visual mocks (screenshots, Figma exports, drawn sketches),
  they can put them in a `mocks/` directory and reference them from the design
  system doc. The review phase will compare against them visually.
- For best results, the design system should specify both tokens (concrete values)
  and principles (aesthetic direction, feel, personality).
