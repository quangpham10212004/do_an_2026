// Sinh CSS custom properties từ design-system/tokens.json (nguồn duy nhất của token, đồng bộ với Claude Design).
//   node design-system/build-tokens.mjs  → src/styles/tokens.css (app) + design-system/tokens.css (bản cho Claude Design)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(readFileSync(join(here, "tokens.json"), "utf8"));
const [first, ...rest] = t.color.themes.map((th) => th.id);
const themed = [...t.color.tokens, ...(t.shadow?.tokens ?? [])];
const val = (tok, theme) => (typeof tok.value === "string" ? tok.value : tok.value[theme] ?? tok.value[first]);
const decl = (theme, pad = "  ") =>
  themed
    .filter((tok) => theme === first || (typeof tok.value === "object" && tok.value[theme]))
    .map((tok) => `${pad}--${tok.name}: ${val(tok, theme)};`)
    .join("\n");
const statics = [
  ...t.spacing.tokens.map((x) => `  --${x.name}: ${x.value};`),
  ...t.radius.tokens.map((x) => `  --${x.name}: ${x.value};`),
  ...Object.entries(t.type.families).map(([k, v]) => `  --font-${k}: ${v};`),
].join("\n");
const typeClasses = t.type.groups
  .flatMap((g) =>
    g.styles.map(
      (s) =>
        `.${s.name} { font-family: var(--font-${s.family ?? g.family}); font-size: ${s.fontSize}; line-height: ${s.lineHeight}; font-weight: ${s.fontWeight}${s.letterSpacing ? `; letter-spacing: ${s.letterSpacing}` : ""}; }`,
    ),
  )
  .join("\n");

const header = `/* ${t.name} — generated from tokens.json */`;
const themeBlocks = rest.map((th) => `[data-theme="${th}"] {\n${decl(th)}\n  color-scheme: ${th};\n}`).join("\n");

// Bản cho Claude Design: đúng bố cục "tokens.css as compiled" (theme qua [data-theme]).
const fontFaces = t.type.fonts
  .map((f) => `@font-face { font-family: "${f.family}"; src: url("${f.file}") format("woff2"); font-weight: ${f.weight}; font-style: normal; font-display: swap; }`)
  .join("\n");
writeFileSync(
  join(here, "tokens.css"),
  `${header}\n:root, [data-theme="${first}"] {\n${decl(first)}\n}\n${themeBlocks}\n:root {\n${statics}\n}\n${typeClasses}\n${fontFaces}\n`,
);

// Bản cho app: thêm prefers-color-scheme (người dùng chưa chọn theme thì theo hệ điều hành); font do @fontsource nạp.
const dark = rest[0];
writeFileSync(
  join(here, "..", "src", "styles", "tokens.css"),
  `${header} — đừng sửa tay: node design-system/build-tokens.mjs */\n:root {\n${decl(first)}\n${statics}\n  color-scheme: ${first};\n}\n@media (prefers-color-scheme: ${dark}) {\n  :root:not([data-theme="${first}"]) {\n${decl(dark, "    ")}\n    color-scheme: ${dark};\n  }\n}\n:root[data-theme="${dark}"] {\n${decl(dark)}\n  color-scheme: ${dark};\n}\n`.replace("*/ — đừng", "— đừng"),
);
console.log("tokens.css written");
