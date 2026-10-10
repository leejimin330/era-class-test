import { describe, it, expect } from "vitest";
import { computeOutcomes, rarityOf } from "../src/probability";
import type { ResolvedEra, SocialClass } from "../src/schema";

const cls = (id: string, share: number): SocialClass => ({
  id, name: id, share, shareConfidence: "mid", lifespan: [20, 40],
  statBase: { body: [1, 2], mind: [1, 2], charm: [1, 2], luck: [1, 2] },
  jobs: ["a", "b", "c"], meals: ["a", "b", "c"], historyTips: ["t"], sources: ["s"],
  daySummaries: [], dayDetail: [], events: [], jokes: [],
});
const era = (id: string, group: "history" | "future", pops: number[]): ResolvedEra => ({
  id, group, year: 0, name: id, yearLabel: id, fictional: group === "future", worldPopulation: pops.reduce((a, b) => a + b), sources: ["s"],
  polities: pops.map((population, i) => ({ id: `${id}-p${i}`, name: `p${i}`, kind: "polity" as const, population, populationConfidence: "mid" as const, sources: ["s"],
    classes: [cls("farmer", 0.999999), cls("king", 0.000001)] })),
});
const W = { history: 0.85, future: 0.15 };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("computeOutcomes", () => {
  it("sums to 1 with both groups", () => {
    const o = computeOutcomes([era("h1", "history", [30, 70]), era("h2", "history", [1]), era("f1", "future", [5])], W);
    expect(sum(o.map((x) => x.p))).toBeCloseTo(1, 12);
  });
  it("applies group weights then uniform within group", () => {
    const o = computeOutcomes([era("h1", "history", [1]), era("h2", "history", [1]), era("f1", "future", [1])], W);
    const byEra = (id: string) => sum(o.filter((x) => x.eraId === id).map((x) => x.p));
    expect(byEra("h1")).toBeCloseTo(0.425, 12);
    expect(byEra("f1")).toBeCloseTo(0.15, 12);
  });
  it("renormalizes to history only when no future eras exist", () => {
    const o = computeOutcomes([era("h1", "history", [1])], W);
    expect(sum(o.map((x) => x.p))).toBeCloseTo(1, 12);
  });
  it("keeps tiny ruler probability and population proportion", () => {
    const o = computeOutcomes([era("h1", "history", [25, 75])], W);
    const king = o.find((x) => x.polityId === "h1-p0" && x.classId === "king")!;
    expect(king.p).toBeCloseTo(0.25 * 0.000001, 15);
    expect(king.rarity).toBe("legendary");
  });
  it("throws when all group weights of present groups are 0", () => {
    expect(() => computeOutcomes([era("h1", "history", [1])], { history: 0, future: 1 })).toThrow();
  });
});

describe("rarityOf", () => {
  it("uses spec thresholds (inclusive lower bound)", () => {
    expect(rarityOf(0.01)).toBe("common");
    expect(rarityOf(0.0099)).toBe("uncommon");
    expect(rarityOf(0.001)).toBe("uncommon");
    expect(rarityOf(0.0001)).toBe("rare");
    expect(rarityOf(0.00001)).toBe("epic");
    expect(rarityOf(0.0000099)).toBe("legendary");
  });
});
