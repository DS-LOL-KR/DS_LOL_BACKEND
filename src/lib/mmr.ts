// 라이엇 랭크 순서 (낮음 → 높음). MASTER 이상은 디비전이 없음.
const RANK_ORDER = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
];
const DIVISION_BONUS: Record<string, number> = { IV: 0, III: 100, II: 200, I: 300 };

// "PLATINUM II" 같은 official_tier 문자열을 internal_mmr와 같은 스케일의 점수로
// 변환. SILVER II가 정확히 1000이 되도록 맞춰서, official_tier가 없는(언랭)
// 유저의 기준값과 internal_mmr 기본값(1000)이 같은 출발선에 서게 함.
export function officialTierToScore(officialTier: string | null): number {
  if (!officialTier) return 1000;

  const [rankName, division] = officialTier.trim().toUpperCase().split(" ");
  const rankIndex = RANK_ORDER.indexOf(rankName);
  if (rankIndex === -1) return 1000;

  const divisionBonus = DIVISION_BONUS[division] ?? 300; // MASTER 이상은 디비전이 없어 최고 보너스로 취급
  return rankIndex * 400 + divisionBonus;
}

// 가중치 공식을 바꿀 때마다 이 값을 올림 — game-accounts.service.ts의 performRefresh가
// 계정의 저장된 mmr_version과 비교해서, 라이엇 티어는 그대로여도 공식이 바뀐 걸
// 감지해 재계산하는 데 씀(2026-09-07 도입). 공식은 그대로 두고 상수만 조정하는
// 변경(예: DIVISION_BONUS 값 미세조정)이면 굳이 안 올려도 되지만, 가중치 비율
// 자체가 바뀌면 반드시 올릴 것.
// v2(2026-09-28): "현재 internal_mmr에 섞기" 방식에서 "기록 전체 재합산" 방식으로 변경.
export const CURRENT_MMR_VERSION = 2;

// 라이엇 공식 티어가 internal_mmr 출발점(1000)을 얼마나 끌어당기는지. 0.2면
// 챌린저(3900)는 1580, 아이언 IV(0)는 800에서 출발.
const TIER_WEIGHT = 0.2;
// 매너 평가 1점(5점 만점)당 internal_mmr 가감. 기준 3.5 → 5.0이면 +15, 1.0이면 -25.
const MANNER_MMR_PER_POINT = 10;
// performanceScore(-50~50) 한 점당 매치 하나에서 internal_mmr에 반영할 양. 0.2면
// 매치당 최대 ±10 정도만 움직여서, 내전(custom match) Elo 변동폭(K=32, 보통
// ±20~30)보다는 작게 — 실제 랭크/일반전은 "참고 자료"이고 우리 내전 결과가
// 더 크게 반영되게 하려는 의도.
const PERFORMANCE_TO_MMR_FACTOR = 0.2;

// 매치 하나의 performanceScore가 internal_mmr에 반영되는 양. 동기화 시점의 증분
// 반영(game-accounts.service.ts)과 전체 재합산(calculateInternalMmr) 양쪽에서 같은
// 반올림을 써야 두 값이 어긋나지 않음.
export function performanceScoreToMmrDelta(performanceScore: number): number {
  return Math.round(performanceScore * PERFORMANCE_TO_MMR_FACTOR);
}

export interface InternalMmrInputs {
  officialTier: string | null;
  mannerScore: number;
  // 종료된 내전들의 custom_match_participants.mmr_change 합
  customMatchMmrChangeSum: number;
  // 동기화된 매치들의 performanceScoreToMmrDelta 합
  performanceMmrDeltaSum: number;
}

// 기능명세서: "전체 티어선정" — "전적 + 티어 + 사용자 평가를 이용해 그룹 안에
// 티어를 선정함".
// v1은 `티어 20% + 현재 internal_mmr 70% + 매너 10%`로 현재 값에 다시 섞어넣는
// 구조였는데, 가중치 합이 0.9라 재계산할 때마다 값이 10%씩 깎여 `티어점수 × 2/3`로
// 수렴했음(골드 IV가 연동하자마자 1000 → 940, 매너 평가가 들어올 때마다 내전으로
// 쌓은 MMR이 계속 줄어듦). v2는 이전 internal_mmr을 입력으로 받지 않고 저장된
// 기록만으로 매번 처음부터 계산하므로, 몇 번을 다시 돌려도 결과가 같음.
export function calculateInternalMmr(inputs: InternalMmrInputs): number {
  const tierBase = 1000 + (officialTierToScore(inputs.officialTier) - 1000) * TIER_WEIGHT;
  const mannerAdjustment = (inputs.mannerScore - 3.5) * MANNER_MMR_PER_POINT;
  return Math.round(
    tierBase + mannerAdjustment + inputs.customMatchMmrChangeSum + inputs.performanceMmrDeltaSum,
  );
}
