import path from "node:path";
import { loadDataDir } from "../src/load";
import { checkDataset } from "../src/validate";

const dir = path.resolve(process.argv[2] ?? "data");
const d = loadDataDir(dir);
const issues = [...d.issues, ...checkDataset(d.eras, d.templates)];
for (const i of issues) console.log(`✗ ${i.file ?? ""} ${i.path}: ${i.message}`);
console.log(`${d.eras.length} eras, ${d.templates.length} templates, ${issues.length} issues`);
process.exit(issues.length ? 1 : 0);
