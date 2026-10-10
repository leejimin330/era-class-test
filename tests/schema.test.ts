import { describe, it, expect } from "vitest";
import { SocialClassSchema, PolitySchema, EraSchema } from "../src/schema";

const stat = { body: [5, 10], mind: [5, 10], charm: [5, 10], luck: [5, 10] };
const validClass = {
  id: "farmer", name: "농민", share: 1, shareConfidence: "mid",
  lifespan: [25, 45], statBase: stat,
  jobs: ["a", "b", "c"], meals: ["a", "b", "c"], historyTips: ["t"], sources: ["s"],
};

describe("SocialClassSchema", () => {
  it("accepts a valid class and defaults phase-2 arrays", () => {
    const c = SocialClassSchema.parse(validClass);
    expect(c.jokes).toEqual([]);
    expect(c.events).toEqual([]);
  });
  it("rejects stat out of 1..20", () => {
    expect(() => SocialClassSchema.parse({ ...validClass, statBase: { ...stat, luck: [0, 25] } })).toThrow();
  });
  it("rejects inverted ranges", () => {
    expect(() => SocialClassSchema.parse({ ...validClass, lifespan: [50, 30] })).toThrow();
  });
  it("rejects fewer than 3 jobs", () => {
    expect(() => SocialClassSchema.parse({ ...validClass, jobs: ["a"] })).toThrow();
  });
  it("rejects empty sources", () => {
    expect(() => SocialClassSchema.parse({ ...validClass, sources: [] })).toThrow();
  });
  it("accepts tiny ruler share", () => {
    expect(SocialClassSchema.parse({ ...validClass, share: 0.000002 }).share).toBe(0.000002);
  });
});

describe("PolitySchema", () => {
  const base = { id: "p", name: "P", kind: "polity", population: 10, populationConfidence: "mid", sources: ["s"] };
  it("requires exactly one of classes / classTemplate", () => {
    expect(() => PolitySchema.parse(base)).toThrow();
    expect(() => PolitySchema.parse({ ...base, classes: [validClass], classTemplate: "x" })).toThrow();
    expect(PolitySchema.parse({ ...base, classTemplate: "x" }).classTemplate).toBe("x");
  });
});

describe("EraSchema", () => {
  it("parses a minimal era", () => {
    const era = EraSchema.parse({
      id: "ce1750", group: "history", year: 1750, name: "1750년의 세계", yearLabel: "1750년경",
      worldPopulation: 10, sources: ["s"],
      polities: [{ id: "p", name: "P", kind: "polity", population: 10, populationConfidence: "mid", sources: ["s"], classes: [validClass] }],
    });
    expect(era.fictional).toBe(false);
  });
});
