// 디스코드 슬래시 명령어(/티어표, /전적, /내전결과, /내전모집)를 디스코드 서버에 등록하는
// 1회성 스크립트. `npm run discord:register-commands`로 실행.
//
// DISCORD_TEST_GUILD_ID가 .env에 있으면 그 서버에만 즉시 등록(개발용 — 반영이
// 바로 됨). 없으면 전역(모든 서버) 등록 — 반영까지 최대 1시간 걸릴 수 있음
// (디스코드 공식 문서 기준).
import axios from "axios";
import { env } from "../src/config/env";

// 디스코드 애플리케이션 커맨드 옵션 타입: 3 = STRING, 4 = INTEGER
const STRING_OPTION_TYPE = 3;
const INTEGER_OPTION_TYPE = 4;

const commands = [
  {
    name: "티어표",
    description: "이 디스코드 서버에 연동된 그룹의 티어표를 보여줘요",
  },
  {
    name: "전적",
    description: "그룹원 한 명의 전적을 보여줘요",
    options: [
      {
        name: "닉네임",
        description: "조회할 그룹원의 닉네임",
        type: STRING_OPTION_TYPE,
        required: true,
      },
    ],
  },
  {
    name: "내전결과",
    description: "가장 최근에 끝난 내전 결과를 보여줘요",
  },
  {
    name: "내전모집",
    description: "내전 인원을 모집하고, 확정하면 바로 팀을 짜줘요",
    options: [
      {
        name: "인원",
        description: "모집 인원 (기본 10명)",
        type: INTEGER_OPTION_TYPE,
        required: false,
        min_value: 2,
        max_value: 10,
      },
    ],
  },
];

async function main(): Promise<void> {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_APPLICATION_ID) {
    console.error("DISCORD_BOT_TOKEN / DISCORD_APPLICATION_ID가 .env에 없습니다. 먼저 채워주세요.");
    process.exitCode = 1;
    return;
  }

  const url = env.DISCORD_TEST_GUILD_ID
    ? `https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_TEST_GUILD_ID}/commands`
    : `https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/commands`;

  const { data } = await axios.put<Array<{ name: string }>>(url, commands, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
  });

  console.log(
    `등록 완료 (${env.DISCORD_TEST_GUILD_ID ? `테스트 서버 ${env.DISCORD_TEST_GUILD_ID}, 즉시 반영` : "전역, 최대 1시간 소요"}):`,
    data.map((c) => c.name).join(", "),
  );
}

main().catch((err) => {
  console.error(err.response?.data ?? err);
  process.exitCode = 1;
});
