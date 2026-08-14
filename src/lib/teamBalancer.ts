/**
 * 기능명세서: "팀 구성" — "티어별 비슷한 사람끼리 팀을 구성함, AI가 라인도 고려해서 팀을 짜줌"
 * API 명세서: POST /matches/:id/teams/generate (src/modules/matches/matches.service.ts에서 호출될 예정)
 *
 * TODO: 그리디(greedy) 방식의 팀 밸런싱 구현 필요.
 *
 * 예상 구현 방향 (기획 문서 기준):
 * - 참가자들을 internal_mmr(user_game_stats / user_position_stats) 기준
 *   내림차순으로 정렬한다.
 * - 각 참가자를 현재 총 MMR 합이 더 낮은 팀에 그리디하게 배정해서, 두 팀의
 *   총 MMR이 서로 비슷해지도록 한다.
 * - 배정할 때 다른 선택지가 있다면, 같은 포지션(TOP/JUG/MID/ADC/SUP)을 선호하는
 *   두 참가자를 같은 팀에 넣지 않도록 한다(팀 내 라인 중복 최소화).
 * - 그룹 인원 수나 포지션 분포상 라인 중복이 불가피할 때만 허용한다.
 */
export function balanceTeams(participants: unknown[]): unknown {
  throw new Error("balanceTeams is not implemented yet");
}

export default balanceTeams;
