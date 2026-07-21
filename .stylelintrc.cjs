// Design-scoped Stylelint config (R3, R6; KTD2).
//
// Intentionally has NO `extends` / shared base config: a base ruleset (e.g.
// stylelint-config-standard) would emit non-design findings on any new CSS
// file, violating R6 by construction. `at-rule-no-unknown` and friends stay
// off because nothing here turns them on without a base config.
//
// Four design-only rules, layered so raw colors cannot slip through in any
// notation or position:
//   - color-no-hex / color-named: ban hex and named colors in EVERY
//     declaration, including custom-property declarations (`--x: #hex`) and
//     shorthands the strict-value property list doesn't enumerate.
//   - function-disallowed-list: bans functional color notations
//     (rgb()/hsl()/oklch()/color-mix()/...) everywhere, since
//     declaration-strict-value ignores nothing-but-var() functions only via
//     its own options and the color-* rules cover only hex/named.
//   - declaration-strict-value: color-bearing longhands must use var(--...)
//     tokens. expandShorthand lets tokenized shorthands like
//     `border: 1px solid var(--border)` pass (the raw-value check runs on
//     the expanded longhands, not on "1px").
module.exports = {
  plugins: ["stylelint-declaration-strict-value"],
  rules: {
    "color-no-hex": true,
    "color-named": "never",
    "function-disallowed-list": [
      ["rgb", "rgba", "hsl", "hsla", "hwb", "oklch", "oklab", "lab", "lch", "color", "color-mix", "device-cmyk"],
      { message: "Functional color values are not allowed. Use a var(--color-*) token from web/index.css." },
    ],
    "scale-unlimited/declaration-strict-value": [
      ["/color$/", "fill", "stroke", "background"],
      {
        expandShorthand: true,
        ignoreFunctions: false,
        ignoreValues: ["currentColor", "transparent", "inherit", "none"],
        message:
          'Use a var(--color-*) token from web/index.css instead of the raw value "${value}" for "${property}".',
      },
    ],
  },
  // web/index.css is the sanctioned source of truth for raw color values
  // (the @theme token definitions live there) — everywhere else must
  // reference tokens via var(--...).
  ignoreFiles: ["web/index.css"],
  // web/index.css is currently the repo's only CSS file. With it excluded
  // above, the lint glob matches zero files on a clean repo; without this,
  // Stylelint would exit non-zero on "no files found" and break AE4.
  allowEmptyInput: true,
};
