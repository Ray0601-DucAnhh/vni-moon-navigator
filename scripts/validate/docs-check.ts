/** Pre-submission docs check: no blanks, no stale claims, live link present.
 *  Usage: npm run docs:check */
import { readFileSync } from "node:fs";

const files = ["README.md", "docs/submission/submission-notes.md", "docs/HANDOFF.md"];
const banned: [RegExp, string][] = [
  [/_{4,}/, "blank placeholder ____"],
  [/Not yet deployed/i, "still says not deployed"],
  [/Two analysed sites/i, "still says only 2 sites are analysed"],
  [/Live URL: ask the user/i, "HANDOFF has no live link"],
  [/fill after deploy/i, "'fill after deploy' note left"],
];
let bad = 0;
for (const f of files) {
  const txt = readFileSync(f, "utf8");
  for (const [re, msg] of banned) {
    if (re.test(txt)) {
      console.error(`x ${f}: ${msg}`);
      bad++;
    }
  }
}
if (!/vni-moon-navigator\.vercel\.app/.test(readFileSync("README.md", "utf8"))) {
  console.error("x README.md: live demo link missing");
  bad++;
}
if (bad) process.exit(1);
console.log("docs OK");
