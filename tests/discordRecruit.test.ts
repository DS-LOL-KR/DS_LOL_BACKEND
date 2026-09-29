import { describe, expect, it } from "vitest"; // 테스트 러너의 기본 함수들 (테스트 그룹/케이스/검증)
import request from "supertest"; // 실제 서버를 띄우지 않고 express 앱에 HTTP 요청을 보내기 위해 사용
import { app } from "../src/app"; // 테스트 대상이 되는 Express 앱 인스턴스
import {
  buildRecruitButtons,
  buildRecruitEmbed,
  parseRecruitCustomId,
} from "../src/modules/discord/discordRecruit.service"; // 모집 메시지/버튼 헬퍼
import { buildDiscordLinkUrl, verifyDiscordLinkToken } from "../src/modules/discord/discordLink.service"; // 계정 연결 링크 토큰

function tokenFrom(url: string): string {
  return new URL(url).searchParams.get("token")!;
}

describe("parseRecruitCustomId", () => {
  it("reads the action and match id", () => {
    expect(parseRecruitCustomId("recruit:confirm:42")).toEqual({ action: "confirm", matchId: 42 });
  });

  it("rejects unknown actions and malformed ids", () => {
    expect(parseRecruitCustomId("recruit:hack:42")).toBeNull();
    expect(parseRecruitCustomId("recruit:join:abc")).toBeNull();
    expect(parseRecruitCustomId("other:join:1")).toBeNull();
  });
});

describe("recruit message", () => {
  const createdAt = new Date("2026-09-29T12:00:00Z");

  it("shows a big count, a progress bar, and each player's discord mention", () => {
    const embed = buildRecruitEmbed(
      "민규",
      [
        { nickname: "민규", discordUserId: "111" },
        { nickname: "철수", discordUserId: "222" },
      ],
      10,
      createdAt,
    );
    expect(embed.description).toContain("### 2 / 10명");
    expect(embed.description).toContain("▰▰▱▱▱▱▱▱▱▱");
    expect(embed.fields?.[0].value).toContain("**철수** · <@222>");
    expect(embed.footer?.text).toContain("모집 민규");
  });

  it("changes title and color when full", () => {
    const players = [
      { nickname: "A", discordUserId: "1" },
      { nickname: "B", discordUserId: "2" },
    ];
    const full = buildRecruitEmbed("민규", players, 2, createdAt);
    const open = buildRecruitEmbed("민규", players.slice(0, 1), 2, createdAt);
    expect(full.title).toContain("마감");
    expect(full.color).not.toBe(open.color);
  });

  it("disables only the join button when full", () => {
    const [row] = buildRecruitButtons(7, true);
    const byLabel = Object.fromEntries(row.components.map((b) => [b.label, b]));
    expect(byLabel["참가"].disabled).toBe(true);
    expect(byLabel["확정"].disabled).toBeUndefined();
    expect(byLabel["확정"].custom_id).toBe("recruit:confirm:7");
  });
});

describe("discord link token", () => {
  it("round-trips the discord user id", () => {
    const token = tokenFrom(buildDiscordLinkUrl("123456789012345678"));
    expect(verifyDiscordLinkToken(token)).toBe("123456789012345678");
  });

  it("rejects a tampered token", () => {
    const token = tokenFrom(buildDiscordLinkUrl("123"));
    expect(() => verifyDiscordLinkToken(token.slice(0, -2) + "xx")).toThrow();
  });

  it("cannot be used as a login cookie", async () => {
    const token = tokenFrom(buildDiscordLinkUrl("123"));
    const res = await request(app).get("/api/users/me").set("Cookie", `token=${token}`);
    expect(res.status).toBe(401);
  });

  it("requires login to link", async () => {
    const res = await request(app).post("/api/users/me/discord").send({ token: "x" });
    expect(res.status).toBe(401);
  });
});
