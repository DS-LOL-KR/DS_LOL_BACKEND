import { describe, expect, it } from "vitest"; // 테스트 러너의 기본 함수들 (테스트 그룹/케이스/검증)
import { buildMatchResultEmbed, buildTeamsEmbed, EMBED_COLOR, fieldValue } from "../src/lib/discordEmbeds"; // 테스트 대상 임베드 빌더

describe("buildTeamsEmbed", () => {
  const players = [
    { nickname: "민규", assignedTeam: "TEAM_A" as const, assignedPosition: "MID", mmr: 1150 },
    { nickname: "철수", assignedTeam: "TEAM_B" as const, assignedPosition: null, mmr: 1120 },
  ];
  const analysis = {
    teamA: { averageMmr: 1150, expectedWinRate: 0.54 },
    teamB: { averageMmr: 1120, expectedWinRate: 0.46 },
    balancePercent: 97.4,
  };

  it("puts red and blue side by side with a big balance line", () => {
    const embed = buildTeamsEmbed(12, players, analysis);
    expect(embed.description).toContain("### ⚖️ 밸런스 97.4%");
    expect(embed.description).toContain("-# 예상 승률  🔴 54% : 46% 🔵");
    expect(embed.fields?.map((f) => f.inline)).toEqual([true, true]);
    expect(embed.fields?.[0].name).toBe("🔴 레드팀 · 평균 1150");
    expect(embed.fields?.[0].value).toBe("`MID` **민규** · 1150");
    expect(embed.fields?.[1].value).toBe("`-  ` **철수** · 1120");
    expect(embed.footer?.text).toContain("내전 #12");
  });
});

describe("buildMatchResultEmbed", () => {
  it("colors by the winning team and shows signed MMR changes", () => {
    const embed = buildMatchResultEmbed(
      3,
      "TEAM_B",
      [
        { nickname: "민규", assignedTeam: "TEAM_A", mmrChange: -16 },
        { nickname: "철수", assignedTeam: "TEAM_B", mmrChange: 16 },
      ],
      new Date("2026-09-29T12:00:00Z"),
    );
    expect(embed.title).toContain("블루팀 승리");
    expect(embed.color).toBe(EMBED_COLOR.blue);
    expect(embed.fields?.[0].value).toBe("**철수** `+16`");
    expect(embed.fields?.[1].value).toBe("**민규** `-16`");
  });
});

describe("fieldValue", () => {
  it("stays within Discord's 1024-character field limit", () => {
    const value = fieldValue(Array.from({ length: 200 }, (_, i) => `**플레이어${i}** · 1000`));
    expect(value.length).toBeLessThanOrEqual(1024);
  });

  it("shows a placeholder when empty", () => {
    expect(fieldValue([], "없음")).toBe("없음");
  });
});
