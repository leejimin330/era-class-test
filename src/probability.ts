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
  p: number;        // 전체 확률 (화면 표시용)
  pInEra: number;   // 시대 내 확률 = P(정체|시대) × P(계급|정체) — 레어도 기준
  rarity: Rarity;
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
          const pInEra = pPol * (c.share / shareSum);
          out.push({ eraId: era.id, polityId: pol.id, classId: c.id, eraLabel: era.yearLabel, polityName: pol.name, className: c.name, p: pEra * pInEra, pInEra, rarity: rarityOf(pInEra) });
        }
      }
    }
  }
  return out;
}
