import { describe, expect, it } from "vitest"; // 테스트 러너의 기본 함수들 (테스트 그룹/케이스/검증)
import { calculateInternalMmr, officialTierToScore, performanceScoreToMmrDelta } from "../src/lib/mmr"; // 테스트 대상 MMR 공식

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
