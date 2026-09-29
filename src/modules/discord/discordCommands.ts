import axios from "axios"; // 디스코드 API로 슬래시 명령어 목록을 조회/등록하기 위해 사용
import { env } from "../../config/env"; // DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_TEST_GUILD_ID
import { logger } from "../../lib/logger"; // 서버 시작 시 등록 결과/실패를 남기기 위해 사용

// 디스코드 슬래시 명령어 목록(/티어표, /전적, /내전결과, /내전모집). 명령어 목록은 우리
// 서버가 아니라 디스코드 쪽에 저장돼서, 코드에 명령어를 추가해도 디스코드에 따로 등록해야
// 입력창에 보임. 예전엔 scripts/registerDiscordCommands.ts를 손으로 한 번씩 돌려야
// 했는데, 배포할 때 깜빡하면 새 명령어가 안 보여서 서버 시작 시 자동으로 맞추도록
// 바꿈(2026-09-29). 수동 스크립트도 같은 함수를 씀.
//
// DISCORD_TEST_GUILD_ID가 있으면 그 서버에만 등록(즉시 반영, 개발용). 없으면 전역
// 등록(봇이 들어간 모든 서버, 반영까지 최대 1시간 — 디스코드 공식 문서 기준).

// 디스코드 애플리케이션 커맨드 옵션 타입: 3 = STRING, 4 = INTEGER
const STRING_OPTION_TYPE = 3;
const INTEGER_OPTION_TYPE = 4;

interface DiscordCommandOption {
  name: string;
  description: string;
  type: number;
  required?: boolean;
  min_value?: number;
  max_value?: number;
}

interface DiscordCommandDefinition {
  name: string;
  description: string;
  options?: DiscordCommandOption[];
}

export const DISCORD_COMMANDS: DiscordCommandDefinition[] = [
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

function commandsUrl(): string {
  return env.DISCORD_TEST_GUILD_ID
    ? `https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_TEST_GUILD_ID}/commands`
    : `https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/commands`;
}

// 디스코드가 돌려주는 명령어에는 id/version 같은 필드와 기본값(required: false 등)이
// 더 붙어 있어서, 우리가 정하는 필드만 같은 모양으로 뽑아서 비교함.
export function normalizeDiscordCommands(commands: DiscordCommandDefinition[]): string {
  const projected = commands
    .map((c) => ({
      name: c.name,
      description: c.description,
      options: (c.options ?? []).map((o) => ({
        name: o.name,
        description: o.description,
        type: o.type,
        required: o.required ?? false,
        min_value: o.min_value ?? null,
        max_value: o.max_value ?? null,
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify(projected);
}

export interface DiscordCommandSyncResult {
  scope: "guild" | "global";
  changed: boolean;
  names: string[];
}

// 디스코드에 등록된 목록이 코드와 다를 때만 덮어씀 — 로컬 개발 중 tsx watch가 재시작될
// 때마다 똑같은 목록을 다시 등록하지 않게 하려는 것. 같은 목록을 PUT해도 결과는 같음.
export async function syncDiscordCommands(): Promise<DiscordCommandSyncResult> {
  const url = commandsUrl();
  const headers = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` };
  const scope = env.DISCORD_TEST_GUILD_ID ? "guild" : "global";

  const { data: registered } = await axios.get<DiscordCommandDefinition[]>(url, { headers });
  if (normalizeDiscordCommands(registered) === normalizeDiscordCommands(DISCORD_COMMANDS)) {
    return { scope, changed: false, names: registered.map((c) => c.name) };
  }

  const { data } = await axios.put<DiscordCommandDefinition[]>(url, DISCORD_COMMANDS, { headers });
  return { scope, changed: true, names: data.map((c) => c.name) };
}

// server.ts에서 호출. 봇 설정이 없으면(로컬에서 디스코드 안 쓸 때) 건너뛰고, 디스코드
// API가 실패해도 서버는 계속 뜸 — 명령어 등록 실패가 웹 API까지 막으면 안 되니까.
export async function syncDiscordCommandsOnStartup(): Promise<void> {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_APPLICATION_ID) {
    logger.info("Discord commands sync skipped (DISCORD_BOT_TOKEN / DISCORD_APPLICATION_ID not set)");
    return;
  }

  try {
    const result = await syncDiscordCommands();
    logger.info(result.changed ? "Discord commands registered" : "Discord commands already up to date", result);
  } catch (err) {
    logger.error("Discord commands sync failed", {
      message: err instanceof Error ? err.message : String(err),
      response: axios.isAxiosError(err) ? err.response?.data : undefined,
    });
  }
}
