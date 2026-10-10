# 데이터셋 구축 (서브프로젝트 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 역사 24개 + 미래 4개 시간 단면의 인구·계급 데이터셋(JSON)과, 이를 검증하고 확률·레어도 검토표를 생성하는 스크립트를 만든다.

**Architecture:** `data/`의 JSON이 유일한 원본. `src/`에 zod 스키마·로더·검증·확률 계산을 순수 함수로 두고, `scripts/`의 CLI 두 개(validate, report)가 이를 호출한다. 역사 데이터는 웹 조사로 출처를 달아 작성하고, 미래 데이터는 Gemini 프롬프트 키트로 초안을 받아 정리한다.

**Tech Stack:** Node 24, TypeScript 5.6, tsx 4.19, zod 3.23, vitest 2.1

**Spec:** `docs/superpowers/specs/2026-10-10-era-dataset-design.md` (원 기획서: `docs/original-spec.md`)

## Global Constraints

- 시대 추첨: 묶음 가중치 `history: 0.85`, `future: 0.15`, 묶음 내 균등. `data/config.json`의 `eraGroupWeights`로 분리.
- 정체 비율은 `population`(백만 명)에서 파생. 손으로 비율을 적지 않는다.
- 계급 `share` 합 = 1.0 (±0.001), 정체 인구 합 = `worldPopulation` (±1%).
- 모든 정체·계급에 `sources` 1개 이상 + 신뢰도(`high|mid|low`).
- 계급당 `jobs` 3~6, `meals` 3~6, `historyTips` 1~3, 능력치 범위 1~20.
- 통치자 계급은 별도 계급, share = 왕족 규모 추정 ÷ 인구.
- 노예·천민 등 민감 계급은 존재 반영, 사실만 기록, 조롱 금지. 현존 민족·종교 비하 금지.
- 1000년 이후 단면: 이름 있는 정체로 인구 ~95% (정체 10~20개). 그 이전: ~80~90% (5~10개).
- 미래 단면은 `group: "future"`, `fictional: true`, 출처에 "fictional (Gemini 초안)" 명시.
- 역사 수치는 출처 없이 지어내지 않는다. 근거가 약하면 유사 사회 추정 + `low`.
- 모든 사용자 노출 텍스트는 한국어.

## Review Focus

1. 미래 단면 파일이 아직 없을 때(Gemini 결과 대기) — 확률 계산은 역사 묶음만으로 정규화되어 합 1.0이어야 한다. (Task 3 테스트)
2. 존재하지 않는 `classTemplate` 참조 — 크래시가 아니라 파일·경로를 명시한 검증 오류. (Task 2 테스트)
3. 문법이 깨진 JSON 파일 — 다른 파일 검증은 계속되고 해당 파일명이 오류에 나온다. (Task 2 테스트)
4. 통치자처럼 share가 1e-6 수준인 계급 — 합 검사·레어도 계산에서 반올림으로 사라지지 않는다. (Task 3 테스트)
5. 파일명과 `id` 불일치(`ce1750.json` 안에 `id: "ce1700"`) — 검증 오류. (Task 2 테스트)

---

## File Structure

```
package.json, tsconfig.json, .gitignore
src/schema.ts         zod 스키마 + 타입 (SocialClass, Polity, Era, Template, Config)
src/load.ts           data 디렉터리 읽기 + JSON/스키마 파싱, Issue 수집
src/validate.ts       의미 검사 checkDataset, 템플릿 해석 resolveEras
src/probability.ts    computeOutcomes, rarityOf
src/report.ts         renderReport (markdown 문자열)
scripts/validate-data.ts  CLI: 검사 결과 출력, 오류 시 exit 1
scripts/report.ts         CLI: docs/data-review.md 생성
tests/*.test.ts       vitest
tests/fixtures/       테스트용 미니 데이터 디렉터리
data/config.json, data/version.json
data/templates/*.json 권역 공용 계급 템플릿
data/eras/*.json      단면 데이터
data/raw/gemini/      Gemini 원본 출력 보관
prompts/gemini-future-era.md
docs/data-review.md   (생성물)
```

---

### Task 1: 프로젝트 세팅 + 스키마

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `src/schema.ts`, `tests/schema.test.ts`

**Interfaces:**
- Produces: `SocialClassSchema`, `PolitySchema`, `EraSchema`, `TemplateSchema`, `ConfigSchema`; types `Stat`, `Confidence`, `SocialClass`, `Polity`, `Era`, `Template`, `Config`, `ResolvedPolity`, `ResolvedEra`

- [ ] **Step 1: 세팅**

`package.json`:
```json
{
  "name": "era-class-test",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "validate": "tsx scripts/validate-data.ts",
    "report": "tsx scripts/report.ts",
    "typecheck": "tsc --noEmit"
  }
}
```
Run: `npm i zod@3.23.8 && npm i -D typescript@5.6.3 tsx@4.19.2 vitest@2.1.8 @types/node@22.10.2`

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "noEmit": true, "resolveJsonModule": true, "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "scripts", "tests"]
}
```
`.gitignore`: `node_modules/`

- [ ] **Step 2: 실패 테스트 작성** — `tests/schema.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { SocialClassSchema, PolitySchema, EraSchema } from "../src/schema";

const stat = { body: [5, 10], mind: [5, 10], charm: [5, 10], luck: [5, 10] };
export const validClass = {
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
```

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run tests/schema.test.ts` → FAIL (module not found)

- [ ] **Step 4: 구현** — `src/schema.ts`

```ts
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
```

- [ ] **Step 5: 통과 확인** — Run: `npx vitest run tests/schema.test.ts && npx tsc --noEmit` → PASS
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: project setup and zod data schema"`

---

### Task 2: 로더 + 의미 검사 + validate CLI

**Files:**
- Create: `src/load.ts`, `src/validate.ts`, `scripts/validate-data.ts`, `tests/validate.test.ts`, `tests/fixtures/ok/**`, `tests/fixtures/bad/**`

**Interfaces:**
- Consumes: Task 1 스키마·타입
- Produces:
  - `type Issue = { file?: string; path: string; message: string }`
  - `loadDataDir(dir: string): { eras: Era[]; templates: Template[]; config: Config | null; version: string | null; issues: Issue[] }`
  - `checkDataset(eras: Era[], templates: Template[]): Issue[]`
  - `resolveEras(eras: Era[], templates: Template[]): ResolvedEra[]` (미해결 템플릿이면 throw — checkDataset 통과 후에만 호출)

- [ ] **Step 1: 픽스처 작성**

`tests/fixtures/ok/config.json`: `{ "eraGroupWeights": { "history": 0.85, "future": 0.15 } }`
`tests/fixtures/ok/version.json`: `{ "version": "0.0.0-test" }`
`tests/fixtures/ok/templates/hunter-gatherer.json`:
```json
{ "id": "hunter-gatherer", "name": "수렵채집 사회", "classes": [
  { "id": "band-member", "name": "무리 구성원", "share": 0.98, "shareConfidence": "low",
    "lifespan": [20, 40], "statBase": { "body": [10, 16], "mind": [5, 12], "charm": [5, 12], "luck": [3, 12] },
    "jobs": ["사냥", "채집", "도구 제작"], "meals": ["사냥감", "견과류", "덩이줄기"],
    "historyTips": ["팁"], "sources": ["s"] },
  { "id": "elder", "name": "연장자", "share": 0.02, "shareConfidence": "low",
    "lifespan": [40, 60], "statBase": { "body": [5, 10], "mind": [10, 16], "charm": [10, 16], "luck": [10, 16] },
    "jobs": ["중재", "전승", "의례"], "meals": ["사냥감", "견과류", "덩이줄기"],
    "historyTips": ["팁"], "sources": ["s"] } ] }
```
`tests/fixtures/ok/eras/ce1000.json`: history era, `worldPopulation: 100`, 정체 2개 — `ce1000-a`(population 90, classes 2개: share 0.999998 / 0.000002 통치자) 와 `ce1000-b`(kind region, population 10, `classTemplate: "hunter-gatherer"`).

`tests/fixtures/bad/` — `config.json`(ok와 동일), `templates/`(비어 있음), `eras/`:
- `broken.json`: `{ "id": ` (문법 오류)
- `ce1100.json`: 내용상 `"id": "ce1099"` (파일명 불일치), 정체 1개 `classTemplate: "missing"`
- `ce1200.json`: 계급 share 합 0.9, 정체 인구 합 50 vs `worldPopulation: 100`, 같은 정체 id 두 번

- [ ] **Step 2: 실패 테스트** — `tests/validate.test.ts`

```ts
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
```

- [ ] **Step 3: 실패 확인** — `npx vitest run tests/validate.test.ts` → FAIL

- [ ] **Step 4: 구현** — `src/load.ts`

```ts
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { EraSchema, TemplateSchema, ConfigSchema, type Era, type Template, type Config } from "./schema";

export type Issue = { file?: string; path: string; message: string };

function readJson(file: string, issues: Issue[]): unknown | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    issues.push({ file: path.basename(file), path: "", message: `invalid JSON: ${(e as Error).message}` });
    return undefined;
  }
}

function parseWith<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown, file: string, issues: Issue[]): T | undefined {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  for (const e of r.error.issues) issues.push({ file: path.basename(file), path: e.path.join("."), message: e.message });
  return undefined;
}

function jsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(dir, f));
}

export function loadDataDir(dir: string) {
  const issues: Issue[] = [];
  const eras: Era[] = [];
  const templates: Template[] = [];

  for (const file of jsonFiles(path.join(dir, "eras"))) {
    const raw = readJson(file, issues);
    if (raw === undefined) continue;
    const era = parseWith(EraSchema, raw, file, issues);
    if (!era) continue;
    const expected = path.basename(file, ".json");
    if (era.id !== expected) issues.push({ file: path.basename(file), path: "id", message: `id "${era.id}" does not match file name "${expected}"` });
    eras.push(era);
  }
  for (const file of jsonFiles(path.join(dir, "templates"))) {
    const raw = readJson(file, issues);
    const t = raw === undefined ? undefined : parseWith(TemplateSchema, raw, file, issues);
    if (t) templates.push(t);
  }

  const cfgFile = path.join(dir, "config.json");
  const cfgRaw = fs.existsSync(cfgFile) ? readJson(cfgFile, issues) : undefined;
  const config: Config | null = (cfgRaw !== undefined && parseWith(ConfigSchema, cfgRaw, cfgFile, issues)) || null;
  if (!fs.existsSync(cfgFile)) issues.push({ file: "config.json", path: "", message: "missing config.json" });

  const verFile = path.join(dir, "version.json");
  const verRaw = fs.existsSync(verFile) ? (readJson(verFile, issues) as { version?: unknown } | undefined) : undefined;
  const version = typeof verRaw?.version === "string" ? verRaw.version : null;

  return { eras, templates, config, version, issues };
}
```

`src/validate.ts`
```ts
import type { Era, Template, SocialClass, ResolvedEra } from "./schema";
import type { Issue } from "./load";

const SHARE_TOLERANCE = 0.001;
const POPULATION_TOLERANCE = 0.01;

function dupes(ids: string[]): string[] {
  const seen = new Set<string>(), out = new Set<string>();
  for (const id of ids) (seen.has(id) ? out : seen).add(id);
  return [...out];
}

function checkClasses(classes: SocialClass[], file: string, at: string, issues: Issue[]) {
  const sum = classes.reduce((s, c) => s + c.share, 0);
  if (Math.abs(sum - 1) > SHARE_TOLERANCE) issues.push({ file, path: at, message: `class share sum ${+sum.toFixed(6)} != 1` });
  for (const d of dupes(classes.map((c) => c.id))) issues.push({ file, path: at, message: `duplicate class id "${d}"` });
}

export function checkDataset(eras: Era[], templates: Template[]): Issue[] {
  const issues: Issue[] = [];
  const tplIds = new Set(templates.map((t) => t.id));
  for (const d of dupes(templates.map((t) => t.id))) issues.push({ path: "templates", message: `duplicate template id "${d}"` });
  for (const t of templates) checkClasses(t.classes, `templates/${t.id}.json`, "classes", issues);
  for (const d of dupes(eras.map((e) => e.id))) issues.push({ path: "eras", message: `duplicate era id "${d}"` });

  for (const era of eras) {
    const file = `${era.id}.json`;
    if ((era.group === "future") !== era.fictional) issues.push({ file, path: "fictional", message: `group "${era.group}" requires fictional=${era.group === "future"}` });
    for (const d of dupes(era.polities.map((p) => p.id))) issues.push({ file, path: "polities", message: `duplicate polity id "${d}"` });
    const pop = era.polities.reduce((s, p) => s + p.population, 0);
    if (Math.abs(pop - era.worldPopulation) / era.worldPopulation > POPULATION_TOLERANCE)
      issues.push({ file, path: "polities", message: `population sum ${+pop.toFixed(3)} differs from worldPopulation ${era.worldPopulation} by more than 1%` });
    era.polities.forEach((p, i) => {
      if (p.classTemplate && !tplIds.has(p.classTemplate)) issues.push({ file, path: `polities.${i}`, message: `unknown template "${p.classTemplate}"` });
      if (p.classes) checkClasses(p.classes, file, `polities.${i}.classes`, issues);
    });
  }
  return issues;
}

export function resolveEras(eras: Era[], templates: Template[]): ResolvedEra[] {
  const byId = new Map(templates.map((t) => [t.id, t]));
  return eras.map((era) => ({
    ...era,
    polities: era.polities.map(({ classTemplate, classes, ...p }) => {
      if (classes) return { ...p, classes };
      const t = byId.get(classTemplate!);
      if (!t) throw new Error(`unknown template "${classTemplate}" in ${era.id}/${p.id}`);
      return { ...p, classes: t.classes };
    }),
  }));
}
```

`scripts/validate-data.ts`
```ts
import path from "node:path";
import { loadDataDir } from "../src/load";
import { checkDataset } from "../src/validate";

const dir = path.resolve(process.argv[2] ?? "data");
const d = loadDataDir(dir);
const issues = [...d.issues, ...checkDataset(d.eras, d.templates)];
for (const i of issues) console.log(`✗ ${i.file ?? ""} ${i.path}: ${i.message}`);
console.log(`${d.eras.length} eras, ${d.templates.length} templates, ${issues.length} issues`);
process.exit(issues.length ? 1 : 0);
```

- [ ] **Step 5: 통과 확인** — `npx vitest run && npx tsc --noEmit` → PASS. (fixture의 테스트 정규식은 위 메시지 문구와 맞춘다: `unknown template "missing"` 이 `/template "missing"/`에, `class share sum 0.9` 가 `/share sum 0\.9/`에 매치)
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: data loader, semantic checks, validate CLI"`

---

### Task 3: 확률·레어도 계산

**Files:**
- Create: `src/probability.ts`, `tests/probability.test.ts`

**Interfaces:**
- Consumes: `ResolvedEra`, `Config["eraGroupWeights"]`
- Produces:
  - `type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary"`
  - `RARITY_ORDER: Rarity[]`, `RARITY_LABEL: Record<Rarity, string>`
  - `rarityOf(p: number): Rarity`
  - `type Outcome = { eraId: string; polityId: string; classId: string; eraLabel: string; polityName: string; className: string; p: number; rarity: Rarity }`
  - `computeOutcomes(eras: ResolvedEra[], weights: { history: number; future: number }): Outcome[]`

- [ ] **Step 1: 실패 테스트** — `tests/probability.test.ts`

```ts
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
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/probability.test.ts` → FAIL

- [ ] **Step 3: 구현** — `src/probability.ts`

```ts
import type { ResolvedEra } from "./schema";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
export const RARITY_LABEL: Record<Rarity, string> = {
  common: "★ 커먼", uncommon: "★★ 언커먼", rare: "★★★ 레어", epic: "★★★★ 에픽", legendary: "★★★★★ 레전더리",
};
// 원 기획서 5.3 초안. 분포 확인 후 조정.
const THRESHOLDS: [Rarity, number][] = [["common", 1e-2], ["uncommon", 1e-3], ["rare", 1e-4], ["epic", 1e-5]];

export function rarityOf(p: number): Rarity {
  for (const [r, min] of THRESHOLDS) if (p >= min) return r;
  return "legendary";
}

export type Outcome = {
  eraId: string; polityId: string; classId: string;
  eraLabel: string; polityName: string; className: string;
  p: number; rarity: Rarity;
};

export function computeOutcomes(eras: ResolvedEra[], weights: { history: number; future: number }): Outcome[] {
  const groups = { history: eras.filter((e) => e.group === "history"), future: eras.filter((e) => e.group === "future") };
  const active = (["history", "future"] as const).filter((g) => groups[g].length > 0);
  const total = active.reduce((s, g) => s + weights[g], 0);
  if (total <= 0) throw new Error("era group weights of present groups sum to 0");

  const out: Outcome[] = [];
  for (const g of active) {
    const pEra = weights[g] / total / groups[g].length;
    for (const era of groups[g]) {
      const popSum = era.polities.reduce((s, p) => s + p.population, 0);
      for (const pol of era.polities) {
        const pPol = pol.population / popSum;
        const shareSum = pol.classes.reduce((s, c) => s + c.share, 0);
        for (const c of pol.classes) {
          const p = pEra * pPol * (c.share / shareSum);
          out.push({ eraId: era.id, polityId: pol.id, classId: c.id, eraLabel: era.yearLabel, polityName: pol.name, className: c.name, p, rarity: rarityOf(p) });
        }
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run && npx tsc --noEmit` → PASS
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: outcome probability and rarity computation"`

---

### Task 4: 검토 리포트 생성

**Files:**
- Create: `src/report.ts`, `scripts/report.ts`, `tests/report.test.ts`

**Interfaces:**
- Consumes: `ResolvedEra`, `Outcome`, `RARITY_ORDER`, `RARITY_LABEL`, `loadDataDir`, `checkDataset`, `resolveEras`, `computeOutcomes`
- Produces: `renderReport(eras: ResolvedEra[], outcomes: Outcome[], version: string): string`

- [ ] **Step 1: 실패 테스트** — `tests/report.test.ts`

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadDataDir } from "../src/load";
import { resolveEras } from "../src/validate";
import { computeOutcomes } from "../src/probability";
import { renderReport } from "../src/report";

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
  it("prints tiny probabilities without collapsing to 0", () => {
    expect(md).not.toMatch(/\| 0 \|/);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/report.test.ts` → FAIL

- [ ] **Step 3: 구현** — `src/report.ts`

```ts
import type { ResolvedEra } from "./schema";
import { RARITY_LABEL, RARITY_ORDER, type Outcome } from "./probability";

const pct = (p: number) => (p >= 1e-4 ? `${(p * 100).toFixed(3)}%` : `${p.toExponential(2)}`);

export function renderReport(eras: ResolvedEra[], outcomes: Outcome[], version: string): string {
  const L: string[] = [];
  L.push(`# 데이터셋 검토표`, ``, `- 데이터 버전: ${version}`, `- 단면 ${eras.length}개, 결과 조합 ${outcomes.length}개`, ``);

  L.push(`## 레어도 분포`, ``, `| 등급 | 조합 수 | 누적 확률 |`, `|---|---|---|`);
  for (const r of RARITY_ORDER) {
    const xs = outcomes.filter((o) => o.rarity === r);
    L.push(`| ${RARITY_LABEL[r]} | ${xs.length} | ${pct(xs.reduce((s, o) => s + o.p, 0))} |`);
  }
  L.push(``);

  L.push(`## 신뢰도 low 항목`, ``);
  for (const e of eras) for (const p of e.polities) {
    if (p.populationConfidence === "low") L.push(`- ${e.id} / ${p.name}: 인구`);
    for (const c of p.classes) if (c.shareConfidence === "low") L.push(`- ${e.id} / ${p.name} / ${c.name}: 계급 비율`);
  }
  L.push(``);

  const byKey = new Map(outcomes.map((o) => [`${o.polityId}/${o.classId}`, o]));
  for (const e of [...eras].sort((a, b) => a.year - b.year)) {
    const popSum = e.polities.reduce((s, p) => s + p.population, 0);
    L.push(`## ${e.id} — ${e.name} (${e.yearLabel})${e.fictional ? " [가상]" : ""}`, ``);
    L.push(`세계 인구 ${e.worldPopulation}백만 · 출처: ${e.sources.join("; ")}`, ``);
    L.push(`| 정체 | 종류 | 인구(백만) | 비율 | 신뢰도 |`, `|---|---|---|---|---|`);
    for (const p of [...e.polities].sort((a, b) => b.population - a.population))
      L.push(`| ${p.name} | ${p.kind} | ${p.population} | ${pct(p.population / popSum)} | ${p.populationConfidence} |`);
    L.push(``, `| 정체 | 계급 | share | 최종 P | 레어도 | 신뢰도 |`, `|---|---|---|---|---|---|`);
    for (const p of e.polities) for (const c of p.classes) {
      const o = byKey.get(`${p.id}/${c.id}`)!;
      L.push(`| ${p.name} | ${c.name} | ${pct(c.share)} | ${pct(o.p)} | ${RARITY_LABEL[o.rarity]} | ${c.shareConfidence} |`);
    }
    L.push(``);
  }
  return L.join("\n");
}
```

`scripts/report.ts`
```ts
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
```

- [ ] **Step 4: 통과 확인** — `npx vitest run && npx tsc --noEmit` → PASS
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: markdown review report"`

---

### Task 5: 데이터 골격 + 권역 공용 템플릿

**Files:**
- Create: `data/config.json`, `data/version.json`, `data/templates/{hunter-gatherer,tribal-farming,pastoral-nomad,chiefdom}.json`, `data/raw/gemini/.gitkeep`

- [ ] **Step 1:** `data/config.json` = `{ "eraGroupWeights": { "history": 0.85, "future": 0.15 } }`, `data/version.json` = `{ "version": "0.1.0" }`
- [ ] **Step 2: 조사** — WebSearch로 수렵채집·부족 농경·유목·족장 사회의 계층 구성(예: 족장/전사/평민/노예 비율), 기대수명(수렵채집 출생 시 기대수명 ~21~37세, Gurven & Kaplan 2007 등), 식단 근거 확인.
- [ ] **Step 3: 작성** — 템플릿 4개, 각 3~5계급. 각 계급 jobs/meals 3~6, historyTips 1~3, sources, 신뢰도. 족장 사회에는 "족장" 극소 share 계급 포함.
- [ ] **Step 4: 검증** — `npm run validate` → `0 eras, 4 templates, 0 issues`
- [ ] **Step 5: Commit** — `git add data && git commit -m "data: config, version, regional class templates"`

---

### Task 6: 파일럿 단면 `bce500`

**Files:** Create: `data/eras/bce500.json`

- [ ] **Step 1: 세계 인구 조사** — 기원전 500년 세계 인구 추정(McEvedy & Jones, HYDE 3.3, Durand 등) 2~3개 → 중간값, `sources` 기록.
- [ ] **Step 2: 정체 인구 조사** — 아케메네스 페르시아(~17–35M 범위 연구들), 춘추 주 열국, 인도 16대국/갠지스 권역, 그리스 폴리스, 카르타고, 이집트(페르시아 속주라면 페르시아에 포함 여부 결정 후 명시), 에트루리아·로마 등. 나머지는 권역 템플릿(수렵채집, 부족 농경, 유목, 족장).
- [ ] **Step 3: 계급 조사** — 정체별 4~6계급 (예: 페르시아 — 왕(족) / 귀족·태수 / 사제(마기) / 군인 / 장인·상인 / 농민 / 노예·예속민). 통치자 share = 왕족 규모 ÷ 인구.
- [ ] **Step 4: 사실 항목** — 수명 범위, 능력치 범위, jobs/meals 3~6, historyTips 1~3 (사실만).
- [ ] **Step 5: 검증** — `npm run validate` → 0 issues, `npm run report` → `docs/data-review.md` 생성
- [ ] **Step 6: Commit** — `git add data docs/data-review.md && git commit -m "data: pilot era bce500"`

### Task 7: 파일럿 단면 `ce1750` + 사용자 검토 체크포인트

**Files:** Create: `data/eras/ce1750.json`

- [ ] **Step 1:** 세계 인구(~720–790M, McEvedy/UN/HYDE) 중간값.
- [ ] **Step 2:** 정체 10~20개로 ~95% 커버: 청, 무굴·마라타·벵골 등 인도 세분, 에도 일본, 조선, 오스만, 사파비 이후 페르시아, 프랑스, 합스부르크, 러시아, 영국, 스페인, 프로이센 등, 서아프리카(오요·다호메이·아샨티), 에티오피아, 영국령 북미, 누에바 에스파냐 등. 나머지는 템플릿 권역.
- [ ] **Step 3:** 계급 근거 예 — 조선: 대구·단성 호적대장 연구의 양반·상민·노비 비율(호적상 양반 과대 주의 → `mid`), 프랑스: 앙시앵 레짐 제1·2·3신분 비율, 청: 신사층 비율 연구, 에도: 무사 ~6–7% 등.
- [ ] **Step 4:** 사실 항목 작성
- [ ] **Step 5:** `npm run validate` → 0 issues, `npm run report`
- [ ] **Step 6: Commit** — `git commit -m "data: pilot era ce1750"`
- [ ] **Step 7: 체크포인트** — 사용자에게 `docs/data-review.md` 요약(레어도 분포, low 항목 수) 보고. 형식·수준 승인 후 다음 Task 진행. 피드백은 템플릿/스키마에 반영.

---

### Task 8: Gemini 미래 단면 프롬프트 키트

**Files:** Create: `prompts/gemini-future-era.md`

- [ ] **Step 1:** 키트 작성. 포함 내용:
  - 역할·톤: 유머 80 + 설정 20, 사이버펑크, 한국어.
  - 단면별 컨셉 4개(2077 메가코프 도시국가, 2150 궤도·화성, 2226 네오 재팬, 2400 AI 공동통치) — 한 번에 한 단면씩 요청.
  - 규칙: 정체 5~10개(합계 세계 인구 = worldPopulation), 정체당 계급 4~6개 + 레전더리급 극소 계급 1개, share 합 1.0, jobs/meals 3~6, historyTips(=세계관 팁) 1~3, 현존 민족·종교 비하 금지, 피해 계급 조롱 금지.
  - 출력: Task 1 `EraSchema` 형식의 JSON 1개 (예시 JSON 전체 포함, `group: "future"`, `fictional: true`, `sources: ["fictional (Gemini 초안)"]`), 코드블록만 출력.
- [ ] **Step 2:** 사용자에게 키트 전달. 결과는 `data/raw/gemini/<eraId>.json`으로 저장 요청.
- [ ] **Step 3: Commit** — `git commit -m "docs: gemini future-era prompt kit"`

### Task 9: Gemini 결과 정리 (결과 수령 시)

- [ ] **Step 1:** `data/raw/gemini/<id>.json` → 검수(민감 표현, 비율 규칙) → `data/eras/<id>.json`으로 정리
- [ ] **Step 2:** `npm run validate` → 0 issues, `npm run report`
- [ ] **Step 3: Commit** — `git commit -m "data: future era <id> (Gemini draft)"`

---

### Task 10~14: 나머지 역사 단면 (배치)

각 배치마다 Task 6/7과 동일 절차(세계 인구 → 정체 인구 → 계급 → 사실 항목 → validate → report → commit). 1000년 이후는 ~95% 커버·정체 10~20개, 이전은 80~90%·5~10개.

- [ ] **Task 10 (고대):** `bce2500`, `bce1300`, `bce200`, `ce150`, `ce450`
- [ ] **Task 11 (중세 전기):** `ce750`, `ce1000`, `ce1150`, `ce1280`, `ce1350`
- [ ] **Task 12 (근세):** `ce1400`, `ce1500`, `ce1600`, `ce1650`, `ce1800`
- [ ] **Task 13 (근대):** `ce1850`, `ce1880`, `ce1920`, `ce1945`
- [ ] **Task 14 (현대):** `ce1970`, `ce1990`, `ce2025` — 계급 = 소득 분위(하위 20% … 상위 1%, 최상위 극소). 근거: World Bank PIP, WID.world, UN WPP.

각 배치 commit: `git commit -m "data: eras <ids>"`

### Task 15: 마무리

- [ ] **Step 1:** `npm test && npm run typecheck && npm run validate && npm run report` 전부 성공
- [ ] **Step 2:** 완료 기준 확인 — 역사 24개 0 issues, 레어도 5단계 모두 1건 이상(리포트 분포표), 프롬프트 키트 존재
- [ ] **Step 3:** `data/version.json` → `0.2.0`, commit `chore: dataset v0.2.0`
- [ ] **Step 4:** 사용자에게 레어도 분포 보고 + 임계값 조정 제안
