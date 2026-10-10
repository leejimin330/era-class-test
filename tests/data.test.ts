import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadDataDir } from "../src/load";
import { resolveEras } from "../src/validate";
import { coverageOf } from "../src/report";
import type { ResolvedEra, ResolvedPolity } from "../src/schema";

// 실제 데이터셋에 대한 사실·정합성 가드 (리뷰에서 발견된 결함의 재발 방지)
const d = loadDataDir(path.join(__dirname, "..", "data"));
const eras = resolveEras(d.eras, d.templates);
const era = (id: string) => eras.find((e) => e.id === id)!;
const pol = (eraId: string, polId: string) => era(eraId).polities.find((p) => p.id === polId)!;
const share = (p: ResolvedPolity, classId: string) => p.classes.find((c) => c.id === classId)?.share ?? 0;
const texts = (p: ResolvedPolity) => p.classes.flatMap((c) => [...c.historyTips, ...c.jobs, ...c.meals]);
const all = (fn: (e: ResolvedEra, p: ResolvedPolity) => void) => eras.forEach((e) => e.polities.forEach((p) => fn(e, p)));

describe("industrial-era class shares follow occupational statistics", () => {
  it("UK farmers are a small minority by 1880–1945", () => {
    expect(share(pol("ce1880", "ce1880-uk"), "farmer")).toBeLessThan(0.18);
    expect(share(pol("ce1945", "ce1945-uk"), "farmer")).toBeLessThan(0.1);
  });
  it("US farmers ~27% in 1920 and ~17% in 1945", () => {
    expect(share(pol("ce1920", "ce1920-usa"), "farmer")).toBeGreaterThan(0.2);
    expect(share(pol("ce1920", "ce1920-usa"), "farmer")).toBeLessThan(0.35);
    expect(share(pol("ce1945", "ce1945-usa"), "farmer")).toBeLessThan(0.22);
  });
  it("Soviet Russia 1920 has no collective farms (collectivization began 1929)", () => {
    expect(pol("ce1920", "ce1920-soviet").classes.map((c) => c.id)).not.toContain("kolkhoz");
    expect(texts(pol("ce1920", "ce1920-soviet")).join()).not.toMatch(/콜호스|집단농장/);
  });
  it("20th-century industrial nations do not carry 19th-century tips", () => {
    for (const e of [era("ce1920"), era("ce1945")])
      for (const p of e.polities) expect(texts(p).join(), p.id).not.toMatch(/농업 기계화 이전|콜레라 같은 전염병|10~12시간/);
  });
  it("Japanese polities eat rice, not rye bread", () => {
    for (const id of ["ce1920-japan", "ce1945-japan"]) expect(texts(pol(id.slice(0, 6), id)).join()).not.toMatch(/호밀빵|귀리죽/);
  });
});

describe("templates fit the societies they are attached to", () => {
  it("no cassava in Old World templates (American crop, post-1500)", () => {
    for (const t of d.templates.filter((t) => t.id !== "plantation-colony")) expect(JSON.stringify(t), t.id).not.toContain("카사바");
  });
  it("states are not labelled with stateless/chiefdom templates", () => {
    const stateName = /왕국|왕조|인도|라지푸트|보헤미아|저지대|대월|스리위자야|도시국가|마야|톨텍|테오티우아칸|치무|사파비|푸난|팔라바|찰루키아/;
    all((e, p) => {
      const tpl = d.eras.find((x) => x.id === e.id)!.polities.find((x) => x.id === p.id)!.classTemplate;
      if (tpl === "chiefdom" || tpl === "tribal-farming") expect(p.name, `${p.id} uses ${tpl}`).not.toMatch(stateName);
    });
  });
});

describe("no cross-culture or anachronistic facts", () => {
  it("Roman-specific text stays in Roman/Italian polities", () => {
    all((e, p) => {
      if (/rome|italy/.test(p.id)) return;
      expect(texts(p).join(), p.id).not.toMatch(/로마 노예는 해방|풀스|포스카|로마 원로원 의원이 되려면/);
    });
  });
  it("Mesopotamia-specific text is not attached to Hittites", () => {
    expect(texts(pol("bce1300", "bce1300-hittite")).join()).not.toMatch(/메소포타미아/);
  });
  it("no law-code claims in 2500 BCE Sumer (Ur-Nammu is c. 2100 BCE)", () => {
    expect(texts(pol("bce2500", "bce2500-sumer")).join()).not.toMatch(/법전/);
  });
  it("Ambedkar (b. 1891) only appears from 1920 on", () => {
    all((e, p) => { if (e.year < 1920) expect(texts(p).join(), p.id).not.toContain("암베드카르"); });
  });
  it("early-modern Japan has no ancient ritsuryo/shoen labour text", () => {
    all((e, p) => {
      if (e.year >= 1400 && /japan/.test(p.id)) expect(texts(p).join(), p.id).not.toMatch(/율령|장원 잡역|헤이안 귀족 문화/);
    });
  });
  it("18th-century Britain has no seigneurial corvée", () => {
    expect(texts(pol("ce1750", "ce1750-britain")).join()).not.toMatch(/영주 부역/);
  });
  it("free peasants are not given corvée jobs", () => {
    all((e, p) => p.classes.filter((c) => c.name === "자유농").forEach((c) => expect(c.jobs.join(), p.id).not.toMatch(/부역/)));
  });
  it("Korean/Japanese-specific foods only in Korea/Japan", () => {
    all((e, p) => {
      if (/korea|japan/.test(p.id)) return;
      expect(texts(p).join(), p.id).not.toMatch(/백반|편의점 도시락|오마카세/);
    });
  });
  it("Modi is prime minister, not president", () => {
    expect(share(pol("ce2025", "ce2025-india"), "head")).toBeGreaterThan(0);
    expect(pol("ce2025", "ce2025-india").classes.find((c) => c.id === "head")!.name).toBe("총리 나렌드라 모디");
  });
  it("no victimhood listed as a job", () => {
    all((e, p) => p.classes.forEach((c) => expect(c.jobs.join(), p.id).not.toMatch(/순장/)));
  });
});

describe("named-polity coverage", () => {
  it("contemporary eras name at least 90% of world population", () => {
    for (const id of ["ce1970", "ce1990", "ce2025"]) expect(coverageOf(era(id)), id).toBeGreaterThanOrEqual(0.9);
  });
});
