import { describe, expect, it } from "vitest"; // 테스트 러너의 기본 함수들 (테스트 그룹/케이스/검증)
import { balanceTeams, type TeamBalancerParticipant } from "../src/lib/teamBalancer"; // 테스트 대상 팀 배정 알고리즘

const POSITIONS = ["TOP", "JUG", "MID", "ADC", "SUP"];

function teamSizes(participants: TeamBalancerParticipant[]): [number, number] {
  const assignments = balanceTeams(participants);
  const a = assignments.filter((x) => x.assignedTeam === "TEAM_A").length;
  return [a, assignments.length - a];
}

// 연동 안 한 멤버(기본 MMR 1000, 라인 없음)가 섞이면 라인 중복 회피 규칙 때문에 6대4가
// 나오던 문제(2026-11-03) 회귀 방지 — 수정 전엔 이 분포에서 약 14%가 6대4였음.
describe("balanceTeams team sizes", () => {
  it("always splits 10 people 5 vs 5 even with an unlinked member and overlapping lanes", () => {
    for (let trial = 0; trial < 2000; trial += 1) {
      const participants: TeamBalancerParticipant[] = Array.from({ length: 9 }, (_, i) => ({
        userId: i,
        mmr: 870 + Math.floor(Math.random() * 380),
        preferredPosition: POSITIONS[Math.floor(Math.random() * POSITIONS.length)],
      }));
      participants.push({ userId: 9, mmr: 1000, preferredPosition: null });
      expect(teamSizes(participants)).toEqual([5, 5]);
    }
  });

  it("splits 10 people 5 vs 5 when one player's MMR is far above everyone else", () => {
    const mmrs = [2786, 1248, 1210, 1197, 1191, 1189, 1113, 1066, 1000, 888];
    const sizes = teamSizes(mmrs.map((mmr, userId) => ({ userId, mmr, preferredPosition: null })));
    expect(sizes).toEqual([5, 5]);
  });

  it("keeps team sizes within one for odd counts", () => {
    const participants = Array.from({ length: 7 }, (_, userId) => ({ userId, mmr: 1000 + userId * 50, preferredPosition: "MID" }));
    const [a, b] = teamSizes(participants);
    expect(Math.abs(a - b)).toBe(1);
  });
});
