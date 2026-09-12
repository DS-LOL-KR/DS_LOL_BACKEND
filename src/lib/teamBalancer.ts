/**
 * 기능명세서: "팀 구성" — "티어별 비슷한 사람끼리 팀을 구성함, AI가 라인도 고려해서 팀을 짜줌"
 * API 명세서: POST /matches/:id/teams/generate (src/modules/matches/matches.service.ts에서 호출)
 *
 * 그리디(greedy) 방식:
 * - 참가자들을 mmr 기준 내림차순으로 정렬한다.
 * - mmr 차이가 SIMILAR_MMR_THRESHOLD 이내로 인접한 구간끼리는 순서를 섞는다
 *   ("다시 추첨"을 눌러도 항상 같은 팀만 나오던 문제 수정, 2026-09-12 —
 *   확실히 실력 차이 나는 사람들의 순서는 그대로 둬서 밸런스 품질은 유지).
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

// "다시 추첨"을 눌러도 같은 참가자 명단이면 매번 똑같은 팀이 나오던 문제
// (2026-09-12 문의) — 정렬 후 그리디 배정 알고리즘 자체에 랜덤 요소가 전혀
// 없었기 때문. MMR 차이가 이 값 이하인 인접한 참가자들끼리만 순서를 섞어서,
// 확실히 실력 차이 나는 사람들의 상대적 순서(=팀 밸런스의 핵심)는 그대로
// 지키면서 비슷한 실력끼리는 "다시 추첨"마다 다른 조합이 나오게 함.
const SIMILAR_MMR_THRESHOLD = 50;

function shuffleRange<T>(arr: T[], start: number, end: number): void {
  for (let i = end - 1; i > start; i -= 1) {
    const j = start + Math.floor(Math.random() * (i - start + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// mmr 내림차순으로 이미 정렬된 배열을 받아, 인접 mmr 차이가
// SIMILAR_MMR_THRESHOLD 이내로 이어지는 구간(버킷)마다 그 구간만 셔플함.
function shuffleWithinSimilarMmrBuckets<T extends { mmr: number }>(sorted: T[]): T[] {
  const result = [...sorted];
  let bucketStart = 0;
  for (let i = 1; i <= result.length; i += 1) {
    const chainBroken = i === result.length || result[i].mmr - result[i - 1].mmr < -SIMILAR_MMR_THRESHOLD;
    if (chainBroken) {
      shuffleRange(result, bucketStart, i);
      bucketStart = i;
    }
  }
  return result;
}

export function balanceTeams(participants: TeamBalancerParticipant[]): TeamBalancerAssignment[] {
  if (participants.length < 2) {
    throw new Error("최소 2명 이상의 참가자가 필요합니다.");
  }

  const sorted = shuffleWithinSimilarMmrBuckets([...participants].sort((a, b) => b.mmr - a.mmr));

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
