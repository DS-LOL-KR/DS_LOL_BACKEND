/**
 * 기능명세서: "팀 구성" — "티어별 비슷한 사람끼리 팀을 구성함, AI가 라인도 고려해서 팀을 짜줌"
 * API 명세서: POST /matches/:id/teams/generate (src/modules/matches/matches.service.ts에서 호출)
 *
 * 그리디(greedy) 방식:
 * - 참가자들을 mmr 기준 내림차순으로 정렬한다.
 * - 각 참가자를 현재 총 mmr 합이 더 낮은 팀에 배정해서, 두 팀의 총 mmr이
 *   서로 비슷해지도록 한다.
 * - 단, 그 배정이 이미 같은 포지션을 가진 참가자와 겹치고, 반대 팀에 배정하면
 *   겹치지 않는다면 반대 팀으로 보낸다(라인 중복보다 mmr 밸런스를 우선하되,
 *   양쪽 다 mmr상 큰 차이가 없다면 라인 중복을 피함).
 * - 포지션 정보가 없는(null) 참가자는 그냥 mmr 기준으로만 배정된다.
 */

export type Team = "TEAM_A" | "TEAM_B";

export interface TeamBalancerParticipant {
  userId: number;
  mmr: number;
  preferredPosition: string | null;
}

export interface TeamBalancerAssignment {
  userId: number;
  assignedTeam: Team;
  assignedPosition: string | null;
}

export function balanceTeams(participants: TeamBalancerParticipant[]): TeamBalancerAssignment[] {
  if (participants.length < 2) {
    throw new Error("최소 2명 이상의 참가자가 필요합니다.");
  }

  const sorted = [...participants].sort((a, b) => b.mmr - a.mmr);

  const positionsInTeamA = new Set<string>();
  const positionsInTeamB = new Set<string>();
  let sumA = 0;
  let sumB = 0;
  const assignments: TeamBalancerAssignment[] = [];

  for (const participant of sorted) {
    const lowerTeam: Team = sumA <= sumB ? "TEAM_A" : "TEAM_B";
    const otherTeam: Team = lowerTeam === "TEAM_A" ? "TEAM_B" : "TEAM_A";

    const lowerTeamOverlaps = participant.preferredPosition
      ? (lowerTeam === "TEAM_A" ? positionsInTeamA : positionsInTeamB).has(participant.preferredPosition)
      : false;
    const otherTeamOverlaps = participant.preferredPosition
      ? (otherTeam === "TEAM_A" ? positionsInTeamA : positionsInTeamB).has(participant.preferredPosition)
      : false;

    // mmr이 더 낮은 팀에 넣으면 라인이 겹치는데, 반대 팀엔 안 겹치는 경우에만
    // 반대 팀으로 보냄 — 그 외에는 mmr 밸런스를 그대로 따름.
    const target = lowerTeamOverlaps && !otherTeamOverlaps ? otherTeam : lowerTeam;

    if (target === "TEAM_A") {
      sumA += participant.mmr;
      if (participant.preferredPosition) positionsInTeamA.add(participant.preferredPosition);
    } else {
      sumB += participant.mmr;
      if (participant.preferredPosition) positionsInTeamB.add(participant.preferredPosition);
    }

    assignments.push({
      userId: participant.userId,
      assignedTeam: target,
      assignedPosition: participant.preferredPosition,
    });
  }

  return assignments;
}

export default balanceTeams;
