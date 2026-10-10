import fs from "node:fs";
import path from "node:path";
import { loadDataDir } from "../src/load";
import { checkDataset, resolveEras } from "../src/validate";
import { computeOutcomes } from "../src/probability";
import { renderReport } from "../src/report";

const d = loadDataDir(path.resolve("data"));
const issues = [...d.issues, ...checkDataset(d.eras, d.templates)];
if (issues.length || !d.config) {
  console.error(`validation failed (${issues.length} issues) — run npm run validate`);
  process.exit(1);
}
const eras = resolveEras(d.eras, d.templates);
fs.writeFileSync(path.resolve("docs/data-review.md"), renderReport(eras, computeOutcomes(eras, d.config.eraGroupWeights), d.version ?? "unknown"));
console.log("wrote docs/data-review.md");
