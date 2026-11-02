import { describe, expect, it } from "vitest"; // 테스트 러너의 기본 함수들 (테스트 그룹/케이스/검증)
import {
  buildMyRankContent,
  buildTierCard,
  formatChange,
  formatRecentForm,
  TIER_ME_CUSTOM_ID,
  type TierCardView,
} from "../src/modules/discord/tierCard"; // 테스트 대상 /티어표 카드 빌더
import { DISCORD_COMPONENTS_V2_FLAG, type DiscordContainer } from "../src/modules/discord/discord.types";

const view: TierCardView = {
  groupName: "테스트그룹",
  viewerUserId: 2,
  lastUpdatedAt: "2026-10-11T00:00:00.000Z",
  rows: [
    { userId: 1, nickname: "민규", mmr: 1235, tier: 1, lastChange: 15, recent: [true, true, false] },
    { userId: 2, nickname: "고숭", mmr: 1205, tier: 2, lastChange: -8, recent: [false] },
    { userId: 3, nickname: "철수", mmr: 1100, tier: 3, lastChange: null, recent: [] },
  ],
};

function allText(container: DiscordContainer): string {
  return container.components
    .filter((c): c is { type: 10; content: string } => c.type === 10)
    .map((c) => c.content)
    .join("\n");
}

describe("buildTierCard", () => {
  it("uses a Components V2 container without content/embeds", () => {
    const data = buildTierCard(view);
    expect(data.flags).toBe(DISCORD_COMPONENTS_V2_FLAG);
    expect(data.content).toBeUndefined();
    expect(data.embeds).toBeUndefined();
    expect(data.components?.[0].type).toBe(17);
  });

  it("shows rank, MMR change, recent form and highlights the viewer", () => {
    const text = allText(buildTierCard(view).components![0] as DiscordContainer);
    expect(text).toContain("총 3명");
    expect(text).toContain("<t:1791676800:R>");
    expect(text).toContain("### 🥇 1티어\n` 1` **민규** · `1235` ▲15 🔴🟢🟢");
    expect(text).toContain("👉 ` 2` **고숭** · `1205` ▼8 🔴");
    expect(text).toContain("` 3` **철수** · `1100`");
    expect(text).toContain("내 순위 2위 / 3명");
  });

  it("skips the highlight when the viewer isn't linked or isn't on the table", () => {
    const text = allText(buildTierCard({ ...view, viewerUserId: null }).components![0] as DiscordContainer);
    expect(text).not.toContain("👉");
    expect(text).not.toContain("내 순위");
  });

  it("attaches the [내 순위] button inside the card", () => {
    const container = buildTierCard(view).components![0] as DiscordContainer;
    const row = container.components.find((c) => c.type === 1);
    expect(row && row.type === 1 && row.components[0]).toMatchObject({ custom_id: TIER_ME_CUSTOM_ID });
  });

  it("stays within Discord's 4000-character text limit for big groups", () => {
    const big: TierCardView = {
      ...view,
      rows: Array.from({ length: 300 }, (_, i) => ({
        userId: i + 10,
        nickname: `플레이어${i}`,
        mmr: 1000,
        tier: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
        lastChange: 12,
        recent: [true, false, true, false, true],
      })),
    };
    const text = allText(buildTierCard(big).components![0] as DiscordContainer);
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text).toContain("…외");
  });

  it("shows an empty state", () => {
    const text = allText(buildTierCard({ ...view, rows: [] }).components![0] as DiscordContainer);
    expect(text).toContain("아직 집계된 데이터가 없어요");
  });
});

describe("buildMyRankContent", () => {
  it("summarizes the viewer's rank", () => {
    const content = buildMyRankContent(view, 1);
    expect(content).toContain("민규님은 1위 / 3명");
    expect(content).toContain("직전 내전 ▲15");
    expect(content).toContain("최근 내전 🔴🟢🟢 (2승 1패)");
  });

  it("returns null for someone not on the table", () => {
    expect(buildMyRankContent(view, 99)).toBeNull();
  });
});

describe("formatters", () => {
  it("formats MMR changes with arrows", () => {
    expect(formatChange(15)).toBe("▲15");
    expect(formatChange(-8)).toBe("▼8");
    expect(formatChange(0)).toBe("");
    expect(formatChange(null)).toBe("");
  });

  it("puts the newest match on the right and caps at 5", () => {
    expect(formatRecentForm([true, false, false, false, false, true])).toBe("🔴🔴🔴🔴🟢");
  });
});
