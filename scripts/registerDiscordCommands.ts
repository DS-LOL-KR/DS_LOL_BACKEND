// 디스코드 슬래시 명령어를 지금 바로 디스코드에 맞추는 수동 스크립트.
// `npm run discord:register-commands`로 실행. 서버가 시작될 때도 같은 일을 자동으로
// 하므로(src/modules/discord/discordCommands.ts) 보통은 안 돌려도 됨 — 서버를 안
// 띄우고 명령어만 맞추고 싶을 때 씀.
import { env } from "../src/config/env";
import { syncDiscordCommands } from "../src/modules/discord/discordCommands";

async function main(): Promise<void> {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_APPLICATION_ID) {
    console.error("DISCORD_BOT_TOKEN / DISCORD_APPLICATION_ID가 .env에 없습니다. 먼저 채워주세요.");
    process.exitCode = 1;
    return;
  }

  const result = await syncDiscordCommands();
  const scope =
    result.scope === "guild" ? `테스트 서버 ${env.DISCORD_TEST_GUILD_ID}, 즉시 반영` : "전역, 최대 1시간 소요";
  console.log(`${result.changed ? "등록 완료" : "이미 최신"} (${scope}):`, result.names.join(", "));
}

main().catch((err) => {
  console.error(err.response?.data ?? err);
  process.exitCode = 1;
});
