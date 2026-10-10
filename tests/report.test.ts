import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadDataDir } from "../src/load";
import { resolveEras } from "../src/validate";
import { computeOutcomes } from "../src/probability";
import { renderReport, coverageOf } from "../src/report";

describe("renderReport", () => {
  const d = loadDataDir(path.join(__dirname, "fixtures", "ok"));
  const eras = resolveEras(d.eras, d.templates);
  const md = renderReport(eras, computeOutcomes(eras, d.config!.eraGroupWeights), "0.0.0-test");

  it("has version, rarity summary and per-era section", () => {
    expect(md).toContain("0.0.0-test");
    expect(md).toContain("## 레어도 분포");
    expect(md).toContain("★★★★★ 레전더리");
    expect(md).toContain("## ce1000");
  });
  it("lists low-confidence items", () => {
    expect(md).toContain("## 신뢰도 low 항목");
    expect(md).toMatch(/수렵채집|무리 구성원/);
  });
  it("reports named-polity coverage per era", () => {
    expect(coverageOf(eras[0])).toBeCloseTo(0.9, 6);
    expect(md).toContain("이름 있는 정체 커버율 90.0%");
  });
  it("prints tiny probabilities without collapsing to 0", () => {
    expect(md).not.toContain("| 0.000% |");
    expect(md).toMatch(/e-6|e-7/);
  });
});
