import jwt from "jsonwebtoken"; // OAuth state 토큰 서명/검증(우리 서버가 발급한 요청인지 확인)에 사용
import { prisma } from "../../config/prisma"; // groups 테이블에서 guild_id로 그룹을 찾기 위해 사용
import { env } from "../../config/env"; // DISCORD_APPLICATION_ID, DISCORD_OAUTH_REDIRECT_URI, JWT_SECRET
import { AppError } from "../../lib/AppError"; // 설정 누락/state 위조·만료를 명확한 에러로 표현하기 위해 사용
import { listTiers } from "../tiers/tiers.service"; // /티어표
import { listMatchesForGroup, getMatchById, formatResultBlock } from "../matches/matches.service"; // /내전결과 — 디스코드 웹후크 알림과 같은 포맷 재사용
import type { TierEntry } from "../tiers/tiers.service";

// 티어 등급(1~5)을 훑어보기 좋은 이모지로 — 그냥 숫자보다 채팅에서 눈에 잘 들어옴.
const TIER_EMOJI: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
  4: "4️⃣",
  5: "5️⃣",
};

async function findGroupByGuildId(guildId: string) {
  return prisma.group.findUnique({ where: { discordGuildId: guildId } });
}

// "봇 초대 → 그 서버가 자동으로 이 그룹에 연동" 흐름(2026-09-18 도입, Guild ID를
// 직접 복사해서 입력하는 대신) — 이 URL로 이동해서 사용자가 서버를 선택/승인하면
// 디스코드가 DISCORD_OAUTH_REDIRECT_URI로 되돌려주면서 guild_id를 같이 줌
// (discord.controller.ts handleOAuthCallback). state에 groupId를 서명해서 담아둠 —
// 그래야 콜백이 "누가 어느 그룹을 위해 시작한 요청인지" 위조 없이 알 수 있음
// (요청 시점에 이미 requireGroupOwner로 그룹장인지 확인이 끝난 뒤라, state 자체가
// 위조 불가능하면 콜백에서 다시 소유권을 확인할 필요가 없음).
const DISCORD_OAUTH_STATE_EXPIRES_IN = "10m";

interface DiscordOAuthState {
  groupId: number;
}

export function buildDiscordBotInviteUrl(groupId: number): string {
  if (!env.DISCORD_APPLICATION_ID || !env.DISCORD_OAUTH_REDIRECT_URI) {
    throw new AppError(500, "디스코드 봇 연동이 아직 설정되지 않았습니다.");
  }

  const state = jwt.sign({ groupId } satisfies DiscordOAuthState, env.JWT_SECRET, {
    expiresIn: DISCORD_OAUTH_STATE_EXPIRES_IN,
  });

  const params = new URLSearchParams({
    client_id: env.DISCORD_APPLICATION_ID,
    // bot: 서버에 봇 멤버로 들어감 / applications.commands: 슬래시 명령어를 그
    // 서버에서 쓸 수 있게 함. 둘 다 있어야 /티어표 등이 실제로 동작함.
    scope: "bot applications.commands",
    // 슬래시 명령어 응답은 인터랙션 응답 자체로 처리돼서 봇에 채널 권한이 따로
    // 필요 없음 — 최소 권한(0)으로 초대.
    permissions: "0",
    redirect_uri: env.DISCORD_OAUTH_REDIRECT_URI,
    response_type: "code",
    state,
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function verifyDiscordOAuthState(state: string): number {
  try {
    const payload = jwt.verify(state, env.JWT_SECRET) as DiscordOAuthState;
    return payload.groupId;
  } catch {
    throw new AppError(400, "유효하지 않거나 만료된 요청입니다. 다시 시도해주세요.");
  }
}

// 그룹 관리 화면에서 PATCH /groups/:id/discord-guild로 아직 연동을 안 해둔
// 서버에서 명령어를 쓰면 안내 문구를 대신 돌려줌 — 세 명령어가 공통으로 씀.
const NOT_LINKED_MESSAGE =
  "이 디스코드 서버에 연동된 그룹이 없어요. 그룹 관리 화면에서 디스코드 서버 ID를 먼저 등록해주세요.";

// 기능명세서: "티어표 한눈에 보기" 디스코드 버전 — /티어표
export async function buildTierTableReply(guildId: string): Promise<string> {
  const group = await findGroupByGuildId(guildId);
  if (!group) return NOT_LINKED_MESSAGE;

  const table = await listTiers(group.id, {});

  // "전체" 탭 기준으로는 라인마다 한 줄씩 나오는데(user_position_stats 존재하는
  // 라인 수만큼) 디스코드에는 사람당 한 줄만 필요해서 첫 줄(가장 티어 높은 라인,
  // tiers.service.ts에서 이미 티어순으로 정렬해둠)만 남김.
  const seen = new Set<number>();
  const rows: TierEntry[] = [];
  for (const row of table.tiers) {
    if (seen.has(row.userId)) continue;
    seen.add(row.userId);
    rows.push(row);
  }

  if (rows.length === 0) {
    return `📊 **${group.name} 티어표**\n\n아직 집계된 데이터가 없어요.`;
  }

  const byTier = new Map<1 | 2 | 3 | 4 | 5, TierEntry[]>();
  for (const row of rows) {
    const list = byTier.get(row.tier) ?? [];
    list.push(row);
    byTier.set(row.tier, list);
  }

  const sections = ([1, 2, 3, 4, 5] as const)
    .filter((tier) => byTier.has(tier))
    .map((tier) => {
      const lines = byTier.get(tier)!.map((r) => `${r.nickname.padEnd(10)} MMR ${r.internalMmr}`);
      return `${TIER_EMOJI[tier]} ${tier}티어\n\`\`\`\n${lines.join("\n")}\n\`\`\``;
    });

  return `📊 **${group.name} 티어표**\n\n${sections.join("\n")}`;
}

// 기능명세서: "게임 계정 / 전적" 요약 디스코드 버전 — /전적 [닉네임]
export async function buildPlayerStatsReply(guildId: string, nicknameQuery: string): Promise<string> {
  const group = await findGroupByGuildId(guildId);
  if (!group) return NOT_LINKED_MESSAGE;

  const table = await listTiers(group.id, {});
  const query = nicknameQuery.trim().toLowerCase();
  const rows = table.tiers.filter((r) => r.nickname.toLowerCase() === query);

  if (rows.length === 0) {
    return `❓ "${nicknameQuery}"님을 찾을 수 없어요. 그룹원 닉네임을 정확히 입력해주세요.`;
  }

  const main = rows[0];
  const lines = [
    `🏷️ 공식 티어: ${main.officialTier ?? "언랭크"}`,
    `📈 내부 MMR: ${main.internalMmr} (${main.tier}티어)`,
    `🎮 내전 전적: ${main.customMatchWins}승 ${main.customMatchLosses}패`,
  ];

  const laneRows = rows.filter((r) => r.position);
  if (laneRows.length > 0) {
    const laneLines = laneRows.map((r) => `${r.position.padEnd(4)} ${r.wins}승 ${r.losses}패 · MMR ${r.positionMmr}`);
    lines.push("", "**라인별 전적**", "```\n" + laneLines.join("\n") + "\n```");
  }

  return `👤 **${main.nickname}**\n\n${lines.join("\n")}`;
}

// 기능명세서: "내전 기록 조회" 디스코드 버전 — /내전결과 (가장 최근에 끝난 판)
export async function buildLatestMatchReply(guildId: string): Promise<string> {
  const group = await findGroupByGuildId(guildId);
  if (!group) return NOT_LINKED_MESSAGE;

  // listMatchesForGroup은 createdAt 내림차순이라 맨 앞이 최신 — 그중 FINISHED만.
  const matches = await listMatchesForGroup(group.id);
  const latestFinished = matches.find((m) => m.status === "FINISHED");
  if (!latestFinished) {
    return `🏆 **${group.name}**\n\n아직 종료된 내전이 없어요.`;
  }

  const detail = await getMatchById(latestFinished.id);
  const winners = detail.participants.filter((p) => p.assignedTeam === detail.winningTeam);
  const losers = detail.participants.filter((p) => p.assignedTeam && p.assignedTeam !== detail.winningTeam);
  const teamLabel = detail.winningTeam === "TEAM_A" ? "레드팀" : "블루팀";

  return (
    `🏆 **최근 내전 결과 — ${teamLabel} 승리!**\n\n` +
    `✅ 승리\n${formatResultBlock(winners)}\n` +
    `❌ 패배\n${formatResultBlock(losers)}`
  );
}
