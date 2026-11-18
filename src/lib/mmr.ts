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
// v3(2026-11-19): 라인 MMR 공식 변경(calculatePositionMmr) — 서버 시작 시
// backfillOutdatedMmr가 v3 미만 계정의 internal_mmr/라인 MMR을 DB 기록만으로 다시 계산함.
export const CURRENT_MMR_VERSION = 3;

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

// 라인 MMR이 그 라인 기록을 절반 반영하게 되는 판수. 가중치 = 판수 / (판수 + 이 값)
// → 10판 50%, 30판 75%, 90판 90%.
const POSITION_PRIOR_GAMES = 10;
// 승률 1%p당 라인 MMR 4점(50% 기준 ±200). v2 이전(200)은 판수 신뢰도까지 곱해져
// 실제로는 ±40 안쪽으로만 움직여서 라인 순위가 사실상 전체 MMR 순위였음.
const POSITION_WIN_RATE_SWING = 400;
// 그 라인을 거의 안 해본 사람의 출발점을 전체 MMR보다 이만큼 낮춤. 판수가 쌓일수록
// (1 - 가중치)만큼만 남아서 사라짐 — 1판 -136, 10판 -75, 30판 -38.
// 이게 없으면 1~2판만 해본 라인도 "본인 평균 실력"으로 취급돼서, 전체 MMR이 높은
// 사람이 1판 0%인 라인에서도 그 라인 주력들보다 위에 올라왔음(2026-11-18 지적).
const POSITION_UNFAMILIAR_PENALTY = 150;

export interface PositionMmrInputs {
  // 이 계정의 internal_mmr — 라인 MMR은 여기서 라인 숙련도만큼 위아래로 움직임
  baselineMmr: number;
  gamesPlayed: number;
  winRate: number; // 0~1
  avgPerformanceScore: number; // 라인전 상대 대비 평균, -50~50
}

// 기능명세서: "라인별 티어선정". 그 라인 기록이 많을수록 그 라인 성적(승률 +
// 퍼포먼스)을 많이 반영하고, 적을수록 "숙련도 모름" 페널티 쪽으로 당김.
export function calculatePositionMmr(inputs: PositionMmrInputs): number {
  const games = Math.max(inputs.gamesPlayed, 0);
  const weight = games / (games + POSITION_PRIOR_GAMES);
  const lineSkill = (inputs.winRate - 0.5) * POSITION_WIN_RATE_SWING + inputs.avgPerformanceScore;
  return Math.round(inputs.baselineMmr + weight * lineSkill - (1 - weight) * POSITION_UNFAMILIAR_PENALTY);
}
