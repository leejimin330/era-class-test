# 데이터셋 구축 (서브프로젝트 1) — 설계

- 날짜: 2026-10-10
- 원 기획서: `docs/original-spec.md`
- 범위: **데이터셋 조사·작성 + 검증/리포트 스크립트**까지. 추첨 엔진, 웹 UI, Supabase, 공유 카드는 이후 서브프로젝트.

## 1. 원 기획서 대비 변경 사항 (사용자 확정)

| 항목 | 원 기획서 | 확정 |
|---|---|---|
| 시대 단위 | 문명 이름(로마, 조선 …) 12개 | **연도 단면 20개** |
| 시대 추첨 | `flattened` (k=0.5) 기본 | **`uniform`** — 모든 단면 동일 확률 |
| 나라 추첨 | 시대 내 나라 3~5개 | **그 시점 전 세계 인구** 를 정체/권역으로 분할, 인구 비례 추첨 |
| 시대별 출생자 수 | 필수 | 불필요 (선택 필드로만 유지) |

결과적으로 P(결과) = 1/20 × P(정체|단면) × P(계급|정체). 특정 문명(예: 1750년 조선 ≈ 2%)은 그 자체로 드문 결과가 된다.

## 2. 시간 단면 (20개)

| # | id | 시점 | 주요 정체 (예시, 조사 후 확정) |
|---|---|---|---|
| 1 | `bce2500` | 기원전 2500 | 이집트 고왕국, 수메르, 인더스, 황허 신석기 |
| 2 | `bce1300` | 기원전 1300 | 신왕국 이집트, 히타이트, 상, 미케네 |
| 3 | `bce500` | 기원전 500 | 아케메네스 페르시아, 춘추 주, 그리스, 인도 16대국 |
| 4 | `bce200` | 기원전 200 | 한, 로마 공화정, 셀레우코스, 마우리아 이후 인도 |
| 5 | `ce150` | 150 | 로마, 후한, 파르티아, 쿠샨 |
| 6 | `ce450` | 450 | 북위·남조, 서/동로마, 굽타, 고구려 |
| 7 | `ce750` | 750 | 당, 아바스, 비잔티움, 통일신라, 프랑크 |
| 8 | `ce1000` | 1000 | 북송, 파티마, 비잔티움, 고려, 촐라 |
| 9 | `ce1150` | 1150 | 남송·금, 고려, 셀주크, 노르만 잉글랜드 |
| 10 | `ce1280` | 1280 | 원, 일 칸국, 프랑스·잉글랜드, 고려 |
| 11 | `ce1350` | 1350 | 흑사병기 유럽, 말리, 델리 술탄국, 원 말기 |
| 12 | `ce1500` | 1500 | 명, 오스만, 아즈텍·잉카, 조선, 비자야나가르 |
| 13 | `ce1600` | 1600 | 명 말기, 무굴, 오스만, 사파비, 전국시대 일본 |
| 14 | `ce1750` | 1750 | 청, 무굴 말기, 조선, 에도, 프랑스 |
| 15 | `ce1850` | 1850 | 청, 영국령 인도, 영국, 미국, 조선 |
| 16 | `ce1920` | 1920 | 중화민국, 영국령 인도, 소련, 미국, 일제강점기 조선 |
| 17 | `ce1970` | 1970 | 중국, 인도, 소련, 미국, 한국 |
| 18 | `ce2025` | 2025 | 인도, 중국, 미국, 인도네시아, 한국 … (소득 분위 = 계급) |
| 19 | `ce2100` | 2100 (가상) | UN WPP 중위 전망 기반 |
| 20 | `ce2226` | 2226 (가상) | 네오 재팬 등 가상 정체 |

### 단면 내 분할 규칙
- 이름 있는 정체(`kind: "polity"`)로 그 시점 세계 인구의 **약 80~90%** 를 덮는다. 정체 수는 단면당 5~10개.
- 나머지는 권역 그룹(`kind: "region"`)으로 묶는다. 예: "사하라 이남 농경·목축 사회", "아메리카 원주민 사회", "수렵채집민". 권역에도 계급 3~5개를 둔다.
- 정체마다 **절대 인구 추정치(백만 명)** 를 기록하고, 비율은 스크립트가 계산한다(손으로 합 1.0 맞추지 않음).
- 가상 단면(19, 20)은 `fictional: true`, 수치는 근거 있는 가정(19는 UN WPP 전망, 20은 창작)으로 `sources`에 명시.

## 3. 스키마 (원 기획서 7.2 기준 수정)

```ts
type Confidence = "high" | "mid" | "low";

type Era = {
  id: string;                 // "ce1750"
  year: number;               // 1750, 기원전은 음수
  name: string;               // "1750년의 세계"
  yearLabel: string;          // "1750년경"
  fictional?: boolean;
  worldPopulation: number;    // 백만 명, 정체 합과 일치해야 함
  sources: string[];
  polities: Polity[];
};

type Polity = {
  id: string;                 // "ce1750-joseon"
  name: string;               // "조선"
  kind: "polity" | "region";
  population: number;         // 백만 명 (비율은 파생)
  populationConfidence: Confidence;
  sources: string[];
  classes: SocialClass[];
};

type SocialClass = {
  id: string;
  name: string;
  share: number;              // 정체 내 비율, 합 1.0 (±0.001)
  shareConfidence: Confidence;
  lifespan: [number, number];
  statBase: Record<Stat, [number, number]>; // 각 1~20
  jobs: string[];             // 3~6개
  meals: string[];            // 3~6개
  historyTips: string[];      // 1~3개, 사실만
  sources: string[];
  // 2차(문구 단계)에서 채움 — 이번엔 빈 배열 허용
  daySummaries: string[];
  dayDetail: DayDetail[];
  events: string[];           // LifeEvent id
  jokes: string[];
};
```

- 통치자 계급(왕·황제·칸 등)은 별도 계급으로 둔다. share = 왕족 규모 추정 ÷ 인구 (예: 수십~수백 명 / 수백만 → 극소값). 레전더리 등급의 원천.
- 노예·천민 등은 존재를 반영하고 사실만 기록. (유머 문구는 2차 단계이며 원 기획서 7.3 규칙 적용)
- 현대 단면(17~18)의 계급은 소득 분위(하위 20% … 상위 1%, 최상위 0.001% 등).

## 4. 파일 구조

```
data/
  eras/<eraId>.json     # 단면별 1파일, 유일한 원본
  version.json          # { "version": "0.1.0" }
src/schema.ts           # zod 스키마 (런타임 검증 + TS 타입)
scripts/
  validate-data.ts      # 스키마, id 유일성, 계급 합 1.0, 인구 합 == worldPopulation(±1%), sources 비어있지 않음
  report.ts             # docs/data-review.md 생성
docs/data-review.md     # 검토용 표 (자동 생성, 커밋)
```

툴링: Node 24 + TypeScript + `tsx` + `zod` + `vitest`(스크립트 단위 테스트). Next.js는 다음 서브프로젝트에서 도입.

## 5. 검토 리포트 (`docs/data-review.md`)

- 단면별: 정체/권역, 인구, 비율, 신뢰도, 출처 요약
- 정체별: 계급, share, 최종 확률 P, 레어도 등급
- 전체: 레어도 등급별 누적 확률(커먼이 몇 %인지 등), confidence=low 항목 목록
- 레어도 임계값은 원 기획서 5.3 초안 사용, 분포 보고 다음 단계에서 조정

## 6. 조사 방식

- 인구: HYDE 3.3, McEvedy & Jones, Maddison Project, Our World in Data, UN WPP(1950~2100). 상충 시 중간값 + 출처 병기.
- 계급 비율: 문명별 연구 (예: 로마 Scheidel & Friesen 2009, 영국 Gregory King 1688, 조선 호적대장 연구, 현대 World Bank/WID 소득 분위). 정량 근거가 없으면 유사 사회 추정치 + `low`.
- 진행 순서: **파일럿 2개(`bce500`, `ce1750`)** → 사용자 확인 → 나머지 18개를 시대순 배치로 작성.

## 7. 완료 기준

- 20개 단면 파일 전부 `validate-data` 통과
- 모든 정체·계급에 `sources` 1개 이상, 신뢰도 표기
- `docs/data-review.md` 생성 및 커밋
- 레어도 5단계가 모두 1건 이상 등장

## 8. 범위 밖 (이번에 하지 않음)

추첨 엔진(rng/roll/trpg), UI, Supabase/지갑, OG 카드, 드립·일과·이벤트 문구.
