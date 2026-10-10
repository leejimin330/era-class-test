import { z } from "zod";

const id = z.string().regex(/^[a-z0-9-]+$/, "id must be lowercase kebab-case");
const nonEmptyStrings = z.array(z.string().min(1)).min(1);
const range = (min: number, max: number) =>
  z.tuple([z.number().min(min).max(max), z.number().min(min).max(max)])
    .refine(([a, b]) => a <= b, "range min must be <= max");

export const ConfidenceSchema = z.enum(["high", "mid", "low"]);
export const StatSchema = z.enum(["body", "mind", "charm", "luck"]);

const DayDetailSchema = z.object({
  time: z.enum(["dawn", "morning", "afternoon", "night"]),
  text: z.string().min(1),
});

export const SocialClassSchema = z.object({
  id,
  name: z.string().min(1),
  share: z.number().gt(0).lte(1),
  shareConfidence: ConfidenceSchema,
  lifespan: range(1, 120),
  statBase: z.object({ body: range(1, 20), mind: range(1, 20), charm: range(1, 20), luck: range(1, 20) }),
  jobs: z.array(z.string().min(1)).min(3).max(6),
  meals: z.array(z.string().min(1)).min(3).max(6),
  historyTips: z.array(z.string().min(1)).min(1).max(3),
  sources: nonEmptyStrings,
  daySummaries: z.array(z.string()).default([]),
  dayDetail: z.array(DayDetailSchema).default([]),
  events: z.array(z.string()).default([]),
  jokes: z.array(z.string()).default([]),
});

export const PolitySchema = z.object({
  id,
  name: z.string().min(1),
  kind: z.enum(["polity", "region"]),
  population: z.number().positive(),
  populationConfidence: ConfidenceSchema,
  sources: nonEmptyStrings,
  classes: z.array(SocialClassSchema).min(1).optional(),
  classTemplate: id.optional(),
}).refine((p) => (p.classes ? 1 : 0) + (p.classTemplate ? 1 : 0) === 1, {
  message: "exactly one of classes / classTemplate is required",
});

export const EraSchema = z.object({
  id,
  group: z.enum(["history", "future"]),
  year: z.number().int(),
  name: z.string().min(1),
  yearLabel: z.string().min(1),
  fictional: z.boolean().default(false),
  worldPopulation: z.number().positive(),
  sources: nonEmptyStrings,
  polities: z.array(PolitySchema).min(1),
});

export const TemplateSchema = z.object({
  id,
  name: z.string().min(1),
  classes: z.array(SocialClassSchema).min(1),
});

export const ConfigSchema = z.object({
  eraGroupWeights: z.object({ history: z.number().min(0), future: z.number().min(0) }),
});

export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Stat = z.infer<typeof StatSchema>;
export type SocialClass = z.infer<typeof SocialClassSchema>;
export type Polity = z.infer<typeof PolitySchema>;
export type Era = z.infer<typeof EraSchema>;
export type Template = z.infer<typeof TemplateSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type ResolvedPolity = Omit<Polity, "classes" | "classTemplate"> & { classes: SocialClass[] };
export type ResolvedEra = Omit<Era, "polities"> & { polities: ResolvedPolity[] };
