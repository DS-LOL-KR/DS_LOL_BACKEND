import { describe, expect, it } from "vitest"; // 테스트 러너의 기본 함수들 (테스트 그룹/케이스/검증)
import {
  calculateInternalMmr,
  calculatePositionMmr,
  officialTierToScore,
  performanceScoreToMmrDelta,
} from "../src/lib/mmr"; // 테스트 대상 MMR 공식

const noHistory = { mannerScore: 3.5, customMatchMmrChangeSum: 0, performanceMmrDeltaSum: 0 };

describe("officialTierToScore", () => {
  it("maps SILVER II and unranked to the 1000 baseline", () => {
    expect(officialTierToScore("SILVER II")).toBe(1000);
    expect(officialTierToScore(null)).toBe(1000);
  });

  it("treats MASTER and above as the top division", () => {
    expect(officialTierToScore("CHALLENGER I")).toBe(3900);
  });
});

describe("calculateInternalMmr", () => {
  it("does not push a newly linked account below 1000 for an above-baseline tier", () => {
    // v1에서는 골드 IV가 연동하자마자 1000 → 940으로 떨어졌음
    expect(calculateInternalMmr({ officialTier: "GOLD IV", ...noHistory })).toBe(1040);
    expect(calculateInternalMmr({ officialTier: null, ...noHistory })).toBe(1000);
  });

  it("pulls the starting point 20% toward the official tier", () => {
    expect(calculateInternalMmr({ officialTier: "CHALLENGER I", ...noHistory })).toBe(1580);
    expect(calculateInternalMmr({ officialTier: "IRON IV", ...noHistory })).toBe(800);
  });

  it("keeps custom match and performance history in full", () => {
    const mmr = calculateInternalMmr({
      officialTier: "SILVER II",
      mannerScore: 3.5,
      customMatchMmrChangeSum: 200,
      performanceMmrDeltaSum: -15,
    });
    expect(mmr).toBe(1185);
  });

  it("moves only by the manner score difference, not on every evaluation", () => {
    const base = { officialTier: "SILVER II", customMatchMmrChangeSum: 200, performanceMmrDeltaSum: 0 };
    expect(calculateInternalMmr({ ...base, mannerScore: 3.5 })).toBe(1200);
    expect(calculateInternalMmr({ ...base, mannerScore: 5 })).toBe(1215);
    expect(calculateInternalMmr({ ...base, mannerScore: 1 })).toBe(1175);
  });
});

describe("performanceScoreToMmrDelta", () => {
  it("caps a single match at about ±10", () => {
    expect(performanceScoreToMmrDelta(50)).toBe(10);
    expect(performanceScoreToMmrDelta(-50)).toBe(-10);
  });
});

describe("calculatePositionMmr", () => {
  const line = (gamesPlayed: number, winRate: number, baselineMmr = 1000, avgPerformanceScore = 0) =>
    calculatePositionMmr({ baselineMmr, gamesPlayed, winRate, avgPerformanceScore });

  it("puts a barely-played line well below the account's overall MMR", () => {
    expect(line(1, 1)).toBeLessThan(900);
    expect(line(1, 0)).toBeLessThan(line(1, 1));
  });

  it("ranks a line main with a good record above someone who touched the line once and won", () => {
    // 2026-11-18 지적: 적게 하고 승률 높은 사람이 라인 탭 맨 위에 오던 문제
    expect(line(20, 0.6)).toBeGreaterThan(line(2, 1));
    expect(line(8, 0.75)).toBeGreaterThan(line(1, 1));
  });

  it("lets a long 50% record approach the overall MMR", () => {
    expect(line(90, 0.5)).toBeGreaterThan(980);
    expect(line(90, 0.5)).toBeLessThanOrEqual(1000);
  });

  it("moves meaningfully with win rate once there is a real sample", () => {
    expect(line(30, 0.6) - line(30, 0.4)).toBeGreaterThanOrEqual(55);
  });

  it("matches the ADC example from the production data", () => {
    // 플래티넘 4판 25%는 여전히 브론즈 6판 83%보다 위(전체 MMR 차이 195), 1판 0%는 아래
    expect(line(4, 0.25, 1254)).toBe(1118);
    expect(line(6, 0.83, 1059)).toBe(1015);
    expect(line(8, 0.75, 1048)).toBe(1009);
    expect(line(1, 0, 1139)).toBe(984);
  });
});
