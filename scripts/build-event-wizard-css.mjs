#!/usr/bin/env node
/**
 * Builds dist/event-wizard.css: EventCreateWizard's styles for hosts WITHOUT
 * Tailwind (Cobuntu Embed sites).
 *
 * Tailwind apps (the community app) do not use this; they compile the classes
 * from source via `@source "../node_modules/@cobuntu/event-management-ui/src"`.
 *
 * What it does, and why each step:
 *   1. Compiles Tailwind v4's theme, preflight and utilities for every class used in this
 *      package's src and @cobuntu/management-ui-shared's src.
 *   2. NO global reset: Tailwind's preflight is applied SCOPED to the wizard
 *      root instead, because the markup relies on it (buttons with no UA
 *      chrome, borders that default to solid) and a global reset would restyle
 *      the host's whole page.
 *   3. Every selector is prefixed with `.cbt-event-wizard`, and `:root/:host`
 *      theme variables move onto that class, so nothing leaks out and the
 *      prefix's specificity beats a host's element rules.
 *   4. Cascade layers are flattened: layered rules lose to ANY unlayered host
 *      CSS, which most sites have.
 *   5. Nesting is lowered for older browsers (see below).
 *
 * Tailwind is not a dependency of this package (it ships TS source). Run with
 * a checkout that has tailwindcss v4 + @tailwindcss/postcss + postcss
 * installed, e.g. the community app:
 *
 *   TAILWIND_HOME=../cobuntu-community-app node scripts/build-event-wizard-css.mjs
 *
 * Re-run and commit the output whenever the wizard's markup changes; a test
 * fails when a class used by the wizard is missing from the built file.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "..");
const home = path.resolve(process.env.TAILWIND_HOME || pkg);
const req = createRequire(path.join(home, "package.json"));
const postcss = req("postcss");
const tailwind = req("@tailwindcss/postcss");

const ROOT = ".cbt-event-wizard";
// Its main is src/index.ts; the package root is two levels up.
const shared = path.resolve(path.dirname(createRequire(path.join(pkg, "package.json")).resolve("@cobuntu/management-ui-shared")), "..");
const twDir = path.dirname(req.resolve("tailwindcss/package.json"));

const input = `
@import "${path.join(twDir, "theme.css")}";
@import "${path.join(twDir, "utilities.css")}" source(none);
@source "${path.join(pkg, "src")}";
@source "${path.join(shared, "src")}";
@source not "${path.join(pkg, "src/__tests__")}";
@source not "${path.join(shared, "src/__tests__")}";
`;

/** Top-level commas only: not inside :is(…), and not escaped (`\\,` in class names). */
function splitSelectors(sel) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === "\\") { cur += c + (sel[i + 1] ?? ""); i++; continue; }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

/*
 * `zero` scopes with :where(), keeping Tailwind's preflight at the specificity
 * it was written for. In Tailwind the reset sits in a lower cascade layer than
 * the utilities; flattened, it has to lose on specificity instead, and some
 * utilities (space-y, divide-y) are deliberately zero-specificity :where()s.
 */
function scopeSelector(sel, zero = false) {
  const root = zero ? `:where(${ROOT})` : ROOT;
  return splitSelectors(sel)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => {
      if (s === ":root" || s === ":host" || s === "html" || s === ":host(*)") return [root];
      if (s === "body") return [];
      if (s === "*") return [root, `${root} *`];
      if (s.startsWith("::")) return [`${root}${s}`, `${root} ${s}`];
      return [`${root} ${s}`];
    })
    .filter((s, i, all) => all.indexOf(s) === i)
    .join(",\n");
}

/** Flattens @layer blocks and prefixes every style rule. */
const scope = (zero = false) => ({
  postcssPlugin: "cbt-scope",
  OnceExit(root) {
    root.walkAtRules("layer", (at) => {
      if (at.nodes) at.replaceWith(at.nodes);
      else at.remove(); // `@layer a, b;` order statements
    });
    root.walkRules((rule) => {
      // Only top-level rules (or rules directly under @media/@supports): a rule
      // nested in another rule is relative to it and already inside the scope.
      let p = rule.parent;
      while (p && p.type === "atrule") {
        if (/keyframes$/.test(p.name)) return;
        p = p.parent;
      }
      if (p && p.type === "rule") return;
      const scoped = scopeSelector(rule.selector, zero);
      if (!scoped) rule.remove();
      else rule.selector = scoped;
    });
  },
});
scope.postcss = true;

const from = path.join(pkg, "scripts/.event-wizard.input.css");
const compiled = await postcss([tailwind({ base: pkg })]).process(input, { from });
const utilities = await postcss([scope(false)]).process(compiled.css, { from });
// The reset, compiled on its own (it reads theme values) and scoped at zero specificity.
const resetInput = `@import "${path.join(twDir, "theme.css")}" theme(static);\n@import "${path.join(twDir, "preflight.css")}";\n`;
const resetCompiled = await postcss([tailwind({ base: pkg })]).process(resetInput, { from });
const reset = await postcss([scope(true)]).process(resetCompiled.css, { from });
// Keep only the reset's rules, not a second copy of every theme variable.
const resetRoot = postcss.parse(reset.css);
resetRoot.walkRules((r) => { if (r.selector === `:where(${ROOT})` && r.nodes.every((n) => n.type === "decl" && n.prop.startsWith("--"))) r.remove(); });
/*
 * Tailwind v4 emits CSS nesting (`.md\:block { @media … }`). Lowered here with
 * lightningcss (Tailwind's own dependency), because a host's build will not
 * process this file and older Safari does not nest.
 */
const { transform } = req("lightningcss");
const lowered = transform({
  filename: "event-wizard.css",
  code: Buffer.from(resetRoot.toString() + "\n" + utilities.css),
  minify: false,
  targets: { safari: 15 << 16, chrome: 100 << 16, firefox: 100 << 16 },
}).code.toString();

const banner = `/*! @cobuntu/event-management-ui ${JSON.parse(fs.readFileSync(path.join(pkg, "package.json"), "utf8")).version}
 * EventCreateWizard, prebuilt for hosts without Tailwind. Everything is scoped
 * under ${ROOT}; nothing here touches the rest of the page.
 * Generated by scripts/build-event-wizard-css.mjs. Do not edit by hand. */\n`;

fs.mkdirSync(path.join(pkg, "dist"), { recursive: true });
const out = banner + lowered + "\n";
fs.writeFileSync(path.join(pkg, "dist/event-wizard.css"), out);
console.log(`dist/event-wizard.css ${(out.length / 1024).toFixed(1)} KiB`);
