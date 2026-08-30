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

// 기능명세서: "전체 티어선정" — "전적 + 티어 + 사용자 평가를 이용해 그룹 안에
// 티어를 선정함". 가중치: 라이엇 공식 티어 20% + 기존 internal_mmr 70% +
// 매너 평가(기준 3.5 대비 편차) 10% (2026-08-31 조정 — 공식 티어가 낮아도
// 실제로 잘하는 사람이 있어서 그동안 쌓인(내전 결과가 반영된) internal_mmr
// 쪽 비중을 더 크게 둠). tiers.service.ts(수동 그룹 재선정)와
// game-accounts.service.ts(계정 갱신 시 자동 반영) 양쪽에서 공유해서 씀.
export function recalculateInternalMmr(
  officialTier: string | null,
  currentInternalMmr: number,
  mannerScore: number,
): number {
  const tierScore = officialTierToScore(officialTier);
  const mannerAdjustment = (mannerScore - 3.5) * 100;
  return Math.round(tierScore * 0.2 + currentInternalMmr * 0.7 + mannerAdjustment * 0.1);
}
