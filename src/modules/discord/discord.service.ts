import jwt from "jsonwebtoken"; // OAuth state 토큰 서명/검증(우리 서버가 발급한 요청인지 확인)에 사용
import { prisma } from "../../config/prisma"; // groups 테이블에서 guild_id로 그룹을 찾기 위해 사용
import { env } from "../../config/env"; // DISCORD_APPLICATION_ID, DISCORD_OAUTH_REDIRECT_URI, JWT_SECRET
import { AppError } from "../../lib/AppError"; // 설정 누락/state 위조·만료를 명확한 에러로 표현하기 위해 사용
import { listTiers } from "../tiers/tiers.service"; // /티어표
import { listMatchesForGroup, getMatchById } from "../matches/matches.service"; // /내전결과
import { buildMatchResultEmbed, EMBED_COLOR, fieldValue } from "../../lib/discordEmbeds"; // 임베드 디자인(웹후크 알림과 공용)
import { DISCORD_EPHEMERAL_FLAG, type DiscordInteractionResponse, type DiscordMessageData } from "./discord.types";
import {
  buildMyRankContent,
  buildTierCard,
  TIER_EMOJI,
  TIER_ME_CUSTOM_ID,
  type TierCardRow,
  type TierCardView,
} from "./tierCard"; // /티어표 카드(Components V2) 그리기
import { ephemeral, resolveGroupMember } from "./discordContext"; // [내 순위] 버튼 누른 사람 확인

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

// 로그인 쿠키와 같은 비밀키로 서명하면 이 state를 쿠키에 넣어 authMiddleware를 통과시킬
// 수 있었음(req.user.id가 undefined가 돼서 GET /groups가 전체 그룹을 반환, 2026-10-27
// 발견) — discordLink.service.ts의 링크 토큰처럼 용도별로 비밀키를 분리함.
function oauthStateSecret(): string {
  return `${env.JWT_SECRET}:discord-oauth-state`;
}

export function buildDiscordBotInviteUrl(groupId: number): string {
  if (!env.DISCORD_APPLICATION_ID || !env.DISCORD_OAUTH_REDIRECT_URI) {
    throw new AppError(500, "디스코드 봇 연동이 아직 설정되지 않았습니다.");
  }

  const state = jwt.sign({ groupId } satisfies DiscordOAuthState, oauthStateSecret(), {
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
    const payload = jwt.verify(state, oauthStateSecret()) as Partial<DiscordOAuthState>;
    if (!Number.isInteger(payload.groupId)) throw new Error("invalid state payload");
    return payload.groupId as number;
  } catch {
    throw new AppError(400, "유효하지 않거나 만료된 요청입니다. 다시 시도해주세요.");
  }
}

// 그룹 연동 안 됨, 닉네임 못 찾음 같은 안내는 채널을 어지럽히지 않게 누른 사람에게만 보이는
// 짧은 글로 보냄(EPHEMERAL). 실제 결과는 전부 임베드.
function notice(content: string): DiscordMessageData {
  return { content, flags: DISCORD_EPHEMERAL_FLAG };
}

const NOT_LINKED_NOTICE = notice("이 디스코드 서버에 연동된 그룹이 없어요. 그룹 관리 화면에서 먼저 연동해 주세요.");

// /티어표 카드에 필요한 데이터 — 순위(tiers.service.ts의 members, 사람당 한 줄)에
// 이 그룹 내전 기록(직전 MMR 변화, 최근 승패)을 붙임. 내전 기록은 한 번에 조회.
async function loadTierCardView(group: { id: number; name: string }, viewerUserId: number | null): Promise<TierCardView> {
  const table = await listTiers(group.id, {});
  const userIds = table.members.map((m) => m.userId);

  const participations = await prisma.customMatchParticipant.findMany({
    where: { userId: { in: userIds }, assignedTeam: { not: null }, match: { status: "FINISHED", groupId: group.id } },
    select: { userId: true, assignedTeam: true, mmrChange: true, match: { select: { winningTeam: true } } },
    orderBy: { match: { createdAt: "desc" } },
  });
  const recordsByUserId = new Map<number, Array<{ win: boolean; mmrChange: number }>>();
  for (const p of participations) {
    const list = recordsByUserId.get(p.userId) ?? [];
    list.push({ win: p.assignedTeam === p.match.winningTeam, mmrChange: p.mmrChange });
    recordsByUserId.set(p.userId, list);
  }

  const rows: TierCardRow[] = table.members.map((m) => {
    const records = recordsByUserId.get(m.userId) ?? [];
    return {
      userId: m.userId,
      nickname: m.nickname,
      mmr: m.internalMmr,
      tier: m.tier,
      lastChange: records[0]?.mmrChange ?? null,
      recent: records.map((r) => r.win),
    };
  });

  return { groupName: group.name, rows, viewerUserId, lastUpdatedAt: table.lastUpdatedAt };
}

// 기능명세서: "티어표 한눈에 보기" 디스코드 버전 — /티어표
// 명령어를 쓴 사람이 우리 계정과 연결돼 있으면 그 사람 줄을 강조함(연결 안 됐으면 강조만 생략).
export async function buildTierTableReply(guildId: string, discordUserId?: string): Promise<DiscordMessageData> {
  const group = await findGroupByGuildId(guildId);
  if (!group) return NOT_LINKED_NOTICE;

  const viewer = discordUserId
    ? await prisma.user.findUnique({ where: { discordUserId }, select: { id: true } })
    : null;
  return buildTierCard(await loadTierCardView(group, viewer?.id ?? null));
}

// /티어표 카드의 [내 순위] 버튼 — 누른 사람에게만 보이는 요약
export async function handleTierButton(
  guildId: string,
  discordUserId: string,
  customId: string,
): Promise<DiscordInteractionResponse> {
  if (customId !== TIER_ME_CUSTOM_ID) return ephemeral("알 수 없는 버튼이에요.");

  const ctx = await resolveGroupMember(guildId, discordUserId);
  if ("reply" in ctx) return ctx.reply;

  const view = await loadTierCardView(ctx.group, ctx.user.id);
  const content = buildMyRankContent(view, ctx.user.id);
  return ephemeral(content ?? "아직 티어표에 없어요. 웹에서 게임 계정을 연동하면 올라가요.");
}

// 이 그룹 안에서 실제로 치른 내전(custom_matches) 기록만 뽑음 — 라이엇 랭크/일반전
// 전적이 아니라 "우리끼리 내전에서 몇 승 몇 패 했는지"가 필요해서(2026-09-19 요청,
// /전적이 라이엇 전적 위주였던 걸 내전 전적 위주로 바꿔달라는 문의) 직접 조회함.
// tiers.service.ts의 customMatchWins/Losses(총합)만으로는 "최근에 뭘 했는지"가
// 안 보여서, 매치별 승/패·MMR 변동까지 최신순으로 가져옴.
async function getCustomMatchRecord(userId: number, groupId: number) {
  const participations = await prisma.customMatchParticipant.findMany({
    where: { userId, assignedTeam: { not: null }, match: { status: "FINISHED", groupId } },
    select: { assignedTeam: true, mmrChange: true, match: { select: { winningTeam: true, createdAt: true } } },
    orderBy: { match: { createdAt: "desc" } },
  });

  return participations.map((p) => ({
    win: p.assignedTeam === p.match.winningTeam,
    mmrChange: p.mmrChange,
    playedAt: p.match.createdAt,
  }));
}

const RECENT_MATCH_COUNT = 5;

// 기능명세서: "내전 기록 조회" 개인별 요약 디스코드 버전 — /전적 [닉네임]
export async function buildPlayerStatsReply(guildId: string, nicknameQuery: string): Promise<DiscordMessageData> {
  const group = await findGroupByGuildId(guildId);
  if (!group) return NOT_LINKED_NOTICE;

  const table = await listTiers(group.id, {});
  const query = nicknameQuery.trim().toLowerCase();
  const rows = table.members.filter((r) => r.nickname.toLowerCase() === query);

  if (rows.length === 0) {
    return notice(`"${nicknameQuery}"님을 찾을 수 없어요. 그룹원 닉네임을 정확히 입력해 주세요.`);
  }

  const main = rows[0];
  const record = await getCustomMatchRecord(main.userId, group.id);
  const wins = record.filter((r) => r.win).length;
  const losses = record.length - wins;
  const winRate = record.length > 0 ? Math.round((wins / record.length) * 1000) / 10 : null;

  const recent = record.slice(0, RECENT_MATCH_COUNT).map((r) => {
    const date = r.playedAt.toISOString().slice(5, 10).replace("-", "/");
    const delta = r.mmrChange > 0 ? `+${r.mmrChange}` : `${r.mmrChange}`;
    return `\`${date}\` ${r.win ? "🟢 **승**" : "🔴 **패**"} \`${delta}\``;
  });

  return {
    embeds: [
      {
        title: `👤 ${main.nickname}`,
        description:
          `### 🎮 ${wins}승 ${losses}패${winRate !== null ? ` · 승률 ${winRate}%` : ""}\n` +
          `-# ${TIER_EMOJI[main.tier]} 그룹 내부 ${main.tier}티어 · MMR ${main.internalMmr}`,
        color: EMBED_COLOR.blurple,
        fields: [
          {
            name: `최근 내전 (최대 ${RECENT_MATCH_COUNT}경기)`,
            value: fieldValue(recent, "아직 이 그룹에서 끝난 내전이 없어요."),
          },
        ],
        footer: { text: group.name },
      },
    ],
  };
}

// 기능명세서: "내전 기록 조회" 디스코드 버전 — /내전결과 (가장 최근에 끝난 판)
export async function buildLatestMatchReply(guildId: string): Promise<DiscordMessageData> {
  const group = await findGroupByGuildId(guildId);
  if (!group) return NOT_LINKED_NOTICE;

  // listMatchesForGroup은 createdAt 내림차순이라 맨 앞이 최신 — 그중 FINISHED만.
  const matches = await listMatchesForGroup(group.id);
  const latestFinished = matches.find((m) => m.status === "FINISHED");
  if (!latestFinished) {
    return {
      embeds: [{ title: `🏆 ${group.name} 내전 결과`, description: "아직 종료된 내전이 없어요.", color: EMBED_COLOR.gray }],
    };
  }

  const detail = await getMatchById(latestFinished.id);
  if (!detail.winningTeam) {
    return { embeds: [{ title: `🏆 ${group.name} 내전 결과`, description: "승리팀 기록이 없어요.", color: EMBED_COLOR.gray }] };
  }
  return { embeds: [buildMatchResultEmbed(detail.id, detail.winningTeam, detail.participants, detail.createdAt)] };
}
