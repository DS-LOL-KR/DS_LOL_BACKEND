import { describe, expect, it } from "vitest"; // 테스트 러너의 기본 함수들 (테스트 그룹/케이스/검증)
import { DISCORD_COMMANDS, normalizeDiscordCommands } from "../src/modules/discord/discordCommands"; // 테스트 대상 명령어 목록 비교

// 디스코드 GET 응답처럼 id/version 등이 붙고, required:false가 명시되고, 순서도 다른 목록
function asReturnedByDiscord() {
  return [...DISCORD_COMMANDS].reverse().map((c, i) => ({
    ...c,
    id: `10${i}`,
    application_id: "999",
    version: "1",
    type: 1,
    options: c.options?.map((o) => ({ required: false, ...o })),
  }));
}

describe("normalizeDiscordCommands", () => {
  it("treats Discord's copy of the same commands as unchanged", () => {
    expect(normalizeDiscordCommands(asReturnedByDiscord())).toBe(normalizeDiscordCommands(DISCORD_COMMANDS));
  });

  it("detects a missing command", () => {
    const withoutRecruit = asReturnedByDiscord().filter((c) => c.name !== "내전모집");
    expect(normalizeDiscordCommands(withoutRecruit)).not.toBe(normalizeDiscordCommands(DISCORD_COMMANDS));
  });

  it("detects a changed option", () => {
    const changed = asReturnedByDiscord().map((c) =>
      c.name === "내전모집" ? { ...c, options: c.options?.map((o) => ({ ...o, max_value: 20 })) } : c,
    );
    expect(normalizeDiscordCommands(changed)).not.toBe(normalizeDiscordCommands(DISCORD_COMMANDS));
  });
});
