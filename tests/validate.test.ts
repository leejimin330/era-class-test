import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadDataDir } from "../src/load";
import { checkDataset, resolveEras } from "../src/validate";

const fx = (n: string) => path.join(__dirname, "fixtures", n);

describe("ok fixture", () => {
  it("loads and has no issues", () => {
    const d = loadDataDir(fx("ok"));
    expect(d.issues).toEqual([]);
    expect(checkDataset(d.eras, d.templates)).toEqual([]);
    expect(d.version).toBe("0.0.0-test");
  });
  it("resolves template classes into region polity", () => {
    const d = loadDataDir(fx("ok"));
    const [era] = resolveEras(d.eras, d.templates);
    expect(era.polities.find((p) => p.id === "ce1000-b")!.classes.map((c) => c.id)).toEqual(["band-member", "elder"]);
  });
});

describe("bad fixture", () => {
  const d = loadDataDir(fx("bad"));
  const issues = [...d.issues, ...checkDataset(d.eras, d.templates)];
  const msgs = issues.map((i) => `${i.file ?? ""} ${i.path} ${i.message}`).join("\n");

  it("reports broken JSON by file name and keeps going", () => {
    expect(msgs).toMatch(/broken\.json.*JSON/);
    expect(d.eras.length).toBeGreaterThan(0);
  });
  it("reports file name / id mismatch", () => expect(msgs).toMatch(/ce1100\.json.*ce1099/));
  it("reports missing template", () => expect(msgs).toMatch(/template "missing"/));
  it("reports class share sum", () => expect(msgs).toMatch(/share sum 0\.9/));
  it("reports population mismatch", () => expect(msgs).toMatch(/population sum 50/));
  it("reports duplicate polity id", () => expect(msgs).toMatch(/duplicate polity id/));
});
