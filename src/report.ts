import type { ResolvedEra } from "./schema";
import { RARITY_LABEL, RARITY_ORDER, type Outcome } from "./probability";

const pct = (p: number) => (p >= 1e-4 ? `${(p * 100).toFixed(3)}%` : `${p.toExponential(2)}`);

export function renderReport(eras: ResolvedEra[], outcomes: Outcome[], version: string): string {
  const L: string[] = [];
  L.push(`# 데이터셋 검토표`, ``, `- 데이터 버전: ${version}`, `- 단면 ${eras.length}개, 결과 조합 ${outcomes.length}개`, ``);

  L.push(`## 레어도 분포`, ``, `레어도는 시대 내 확률(P(정체|시대) × P(계급|정체)) 기준. 누적 확률은 전체 추첨 기준.`, ``, `| 등급 | 조합 수 | 누적 확률 |`, `|---|---|---|`);
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
    L.push(``, `| 정체 | 계급 | share | 시대 내 P | 전체 P | 레어도 | 신뢰도 |`, `|---|---|---|---|---|---|---|`);
    for (const p of e.polities) for (const c of p.classes) {
      const o = byKey.get(`${p.id}/${c.id}`)!;
      L.push(`| ${p.name} | ${c.name} | ${pct(c.share)} | ${pct(o.pInEra)} | ${pct(o.p)} | ${RARITY_LABEL[o.rarity]} | ${c.shareConfidence} |`);
    }
    L.push(``);
  }
  return L.join("\n");
}
