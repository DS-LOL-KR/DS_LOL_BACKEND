import { prisma } from "../../config/prisma"; // groups 테이블에서 guild_id로 그룹을 찾기 위해 사용
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
