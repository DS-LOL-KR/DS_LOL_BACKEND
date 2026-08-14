import type { ListTiersQuery } from "./tiers.schema"; // GET /groups/:id/tiers 쿼리(position)의 형태를 명시하기 위해 사용

// 기능명세서: "티어표 한눈에 보기" / "라인별 티어선정"
// API 명세서: GET /groups/:id/tiers (position 쿼리로 라인 필터)
// TODO: 그룹 멤버들의 user_game_stats.internal_mmr / user_position_stats를
// 모아서 티어표를 구성. position이 있으면 user_position_stats 기준으로 필터.
export async function listTiers(groupId: number, query: ListTiersQuery): Promise<unknown[]> {
  throw new Error("Not implemented");
}

// 기능명세서: "전체 티어선정" — "전적 + 티어 + 사용자 평가를 이용해 그룹 안에 티어를 선정함"
// API 명세서: POST /groups/:id/tiers/recalculate
// TODO: 실제 티어 산정 알고리즘 필요 — official_tier(라이엇 전적), internal_mmr,
// manner_score(사용자 평가 누적)를 어떤 가중치로 합칠지 기획 확정 후 구현.
export async function recalculateTiers(groupId: number): Promise<unknown[]> {
  throw new Error("Not implemented");
}
