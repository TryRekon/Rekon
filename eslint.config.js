// Design-scoped ESLint config (U2). Enforces Tailwind class correctness
// against the web/index.css @theme token source. Intentionally excludes
// eslint:recommended and any TypeScript rulesets (R6).
//
// Parser note (deviation from plan): the plan assumed the typescript-eslint
// parser (KTD1/KTD3 research). That parser's typescript-estree package
// crashes on this repo's typescript@^7.0.2 (`ts.Extension` is undefined
// under TS7's restructured API — confirmed via `npx eslint web`, see U2
// execution report). npm `overrides` cannot pin a second typescript version
// for just the typescript-eslint peer because peerDependencies share a
// single resolution across the whole tree. @babel/eslint-parser +
// @babel/preset-typescript parses TSX/TS syntax structurally without
// depending on the `typescript` package's compiler API at all, so it is
// unaffected by the TS7 incompatibility. It is used here strictly as a
// parser (no Babel/TS lint rules are enabled) — R6 is unaffected.
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import babelParser from "@babel/eslint-parser";

// Layered ban on arbitrary color values in class markup. Sizes and other
// non-color arbitrary values (text-[13px], z-[60], rounded-[3px]) stay legal.
//
// 1. Explicit color notation at the start of an arbitrary value on any
//    color-capable utility root, including sided/offset variants:
//    bg-[#f00], border-t-[#f00], ring-offset-[rgb(0,0,0)], caret-[oklch(...)].
const ARBITRARY_COLOR_VALUE =
  "^(bg|text|border(-[trblxyse])?|ring(-offset)?|outline|decoration|caret|accent|divide|fill|stroke|from|via|to|shadow|inset-shadow|inset-ring)-\\[(#|rgb|rgba|hsl|hsla|hwb|oklch|oklab|lab|lch|color)";
// 2. A color notation ANYWHERE inside an arbitrary value, catching compound
//    values like shadow-[0_0_0_2px_#f00] or bg-[linear-gradient(...,#f00)].
const EMBEDDED_COLOR_VALUE =
  "-\\[[^\\]]*(#[0-9a-fA-F]{3}|rgba?\\(|hsla?\\(|hwb\\(|oklch\\(|oklab\\(|lab\\(|lch\\(|color-mix\\(|color\\()";
// 3. CSS named colors as a whole arbitrary value on a color-capable root:
//    bg-[red], border-[navy]. `text-` is included -- a bare named color can
//    never be a font size, so text-[13px] is unaffected.
const NAMED_COLOR_VALUE =
  "^(bg|text|border(-[trblxyse])?|ring(-offset)?|outline|decoration|caret|accent|divide|fill|stroke|from|via|to)-\\[(red|blue|green|yellow|orange|purple|pink|white|black|gray|grey|cyan|magenta|lime|maroon|navy|olive|teal|silver|aqua|fuchsia|crimson|indigo|violet|gold|salmon|coral|khaki|plum|orchid|tan|beige|ivory|azure|lavender|tomato|turquoise|wheat|rebeccapurple)\\]";
// 4. Arbitrary CSS properties that set colors, regardless of value:
//    [background:red], [color:var(--x)], [box-shadow:...]. Tokens have
//    first-class utility classes -- arbitrary color properties are never the
//    sanctioned route.
const ARBITRARY_COLOR_PROPERTY =
  "^\\[(background|background-color|color|fill|stroke|box-shadow|text-shadow|outline-color|border[a-z-]*color|border(-top|-right|-bottom|-left)?|caret-color|accent-color|text-decoration-color|column-rule[a-z-]*)\\s*:";

export default [
  {
    files: ["web/**/*.{ts,tsx}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-typescript", "@babel/preset-react"],
        },
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "better-tailwindcss": betterTailwindcss,
    },
    settings: {
      "better-tailwindcss": {
        entryPoint: "web/index.css",
      },
    },
    rules: {
      "better-tailwindcss/no-unknown-classes": "error",
      "better-tailwindcss/no-conflicting-classes": "error",
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          restrict: [
            {
              pattern: ARBITRARY_COLOR_VALUE,
              message:
                "Arbitrary color values are not allowed. Use a --color-* token from web/index.css instead.",
            },
            {
              pattern: EMBEDDED_COLOR_VALUE,
              message:
                "Raw color inside an arbitrary value is not allowed. Use a --color-* token from web/index.css instead.",
            },
            {
              pattern: NAMED_COLOR_VALUE,
              message:
                "Named CSS colors are not allowed. Use a --color-* token from web/index.css instead.",
            },
            {
              pattern: ARBITRARY_COLOR_PROPERTY,
              message:
                "Arbitrary color properties are not allowed. Use the utility class for a --color-* token from web/index.css instead.",
            },
          ],
        },
      ],
    },
  },
];
