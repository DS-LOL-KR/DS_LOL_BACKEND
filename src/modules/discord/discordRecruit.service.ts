import { Prisma } from "@prisma/client"; // 같은 사람이 [참가]를 동시에 두 번 눌렀을 때(P2002)를 구분하기 위해 사용
import { prisma } from "../../config/prisma"; // groups/users/custom_matches 조회·저장
import { AppError } from "../../lib/AppError"; // 팀 구성/삭제에서 던진 의도된 에러를 디스코드 안내 메시지로 바꾸기 위해 사용
import { deleteMatch, formatRosterBlock, generateTeams } from "../matches/matches.service"; // [확정] 팀 구성, [모집 취소] 삭제 — 웹과 같은 로직 재사용
import { buildDiscordLinkUrl } from "./discordLink.service"; // 연결 안 된 사람에게 줄 계정 연결 링크
import {
  DISCORD_EPHEMERAL_FLAG,
  type DiscordActionRow,
  type DiscordInteractionResponse,
} from "./discord.types";

// 디스코드 /내전모집 → [참가]/[나가기]로 인원을 모으고 → 모집한 사람이나 그룹장이
// [확정]을 누르면 바로 팀이 짜여서 같은 메시지가 팀 결과로 바뀜(2026-09-29).
// 누른 사람은 디스코드 닉네임이 아니라 디스코드 유저 ID(users.discord_user_id)로 찾음.
// 모집 중인 참가자는 custom_match_participants에 assigned_team 없이 저장해둠.

export const MIN_RECRUIT_SIZE = 2;
export const MAX_RECRUIT_SIZE = 10;
export const DEFAULT_RECRUIT_SIZE = 10;

const RECRUIT_ACTIONS = ["join", "leave", "confirm", "cancel"] as const;
type RecruitAction = (typeof RECRUIT_ACTIONS)[number];

// 버튼 custom_id 형식: "recruit:<action>:<matchId>"
export function parseRecruitCustomId(customId: string): { action: RecruitAction; matchId: number } | null {
  const match = /^recruit:([a-z]+):(\d+)$/.exec(customId);
  if (!match || !(RECRUIT_ACTIONS as readonly string[]).includes(match[1])) return null;
  return { action: match[1] as RecruitAction, matchId: Number(match[2]) };
}

function ephemeral(content: string): DiscordInteractionResponse {
  return { type: 4, data: { content, flags: DISCORD_EPHEMERAL_FLAG } };
}

export function buildRecruitButtons(matchId: number, isFull: boolean): DiscordActionRow[] {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: "참가", custom_id: `recruit:join:${matchId}`, disabled: isFull },
        { type: 2, style: 2, label: "나가기", custom_id: `recruit:leave:${matchId}` },
        { type: 2, style: 3, label: "확정", custom_id: `recruit:confirm:${matchId}` },
        { type: 2, style: 4, label: "모집 취소", custom_id: `recruit:cancel:${matchId}` },
      ],
    },
  ];
}

export function buildRecruitContent(hostNickname: string, participantNicknames: string[], size: number): string {
  const list =
    participantNicknames.length > 0
      ? participantNicknames.map((name, i) => `${i + 1}. ${name}`).join("\n")
      : "아직 참가자가 없어요.";
  return (
    `🎮 **내전 모집** (${participantNicknames.length}/${size})\n` +
    `모집: ${hostNickname}\n\n` +
    `${list}\n\n` +
    `모집한 사람이나 그룹장이 [확정]을 누르면 바로 팀이 짜여요.`
  );
}

async function renderRecruitMessage(matchId: number): Promise<DiscordInteractionResponse["data"]> {
  const match = await prisma.customMatch.findUniqueOrThrow({
    where: { id: matchId },
    include: {
      creator: { select: { nickname: true } },
      participants: { include: { user: { select: { nickname: true } } }, orderBy: { id: "asc" } },
    },
  });
  const size = match.recruitSize ?? DEFAULT_RECRUIT_SIZE;
  const nicknames = match.participants.map((p) => p.user.nickname);
  return {
    content: buildRecruitContent(match.creator.nickname, nicknames, size),
    components: buildRecruitButtons(match.id, nicknames.length >= size),
  };
}

// 디스코드 서버 → 연동된 그룹, 디스코드 유저 ID → 우리 유저, 그리고 그 그룹의 멤버인지까지
// 확인. 하나라도 안 되면 누른 사람에게만 보이는 안내 메시지를 돌려줌.
type GroupMemberContext =
  | { reply: DiscordInteractionResponse }
  | { group: Prisma.GroupGetPayload<object>; user: Prisma.UserGetPayload<object> };

async function resolveGroupMember(guildId: string, discordUserId: string): Promise<GroupMemberContext> {
  const group = await prisma.group.findUnique({ where: { discordGuildId: guildId } });
  if (!group) {
    return { reply: ephemeral("이 디스코드 서버에 연동된 그룹이 없어요. 그룹 관리 화면에서 먼저 연동해 주세요.") };
  }

  const user = await prisma.user.findUnique({ where: { discordUserId } });
  if (!user) {
    return {
      reply: ephemeral(
        `아직 DS_LOL 계정과 디스코드가 연결되지 않았어요. 아래 링크를 열어 연결한 뒤 다시 눌러 주세요. (10분 안에 열어야 해요)\n${buildDiscordLinkUrl(discordUserId)}`,
      ),
    };
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: user.id } },
  });
  if (!membership) {
    return {
      reply: ephemeral(`"${group.name}" 그룹에 가입돼 있지 않아요. 그룹장에게 초대 코드를 받아 먼저 가입해 주세요.`),
    };
  }

  return { group, user };
}

// 슬래시 명령어: /내전모집 인원:10
export async function startRecruit(
  guildId: string,
  discordUserId: string,
  size: number,
): Promise<DiscordInteractionResponse> {
  if (!Number.isInteger(size) || size < MIN_RECRUIT_SIZE || size > MAX_RECRUIT_SIZE) {
    return ephemeral(`인원은 ${MIN_RECRUIT_SIZE}~${MAX_RECRUIT_SIZE}명으로 정해 주세요.`);
  }

  const ctx = await resolveGroupMember(guildId, discordUserId);
  if ("reply" in ctx) return ctx.reply;

  // 모집한 사람은 자동으로 첫 참가자 — 안 할 거면 [나가기]를 누르면 됨.
  const match = await prisma.customMatch.create({
    data: {
      groupId: ctx.group.id,
      gameId: ctx.group.gameId,
      createdBy: ctx.user.id,
      recruitSize: size,
      participants: { create: [{ userId: ctx.user.id }] },
    },
  });

  return { type: 4, data: await renderRecruitMessage(match.id) };
}

// 모집 메시지의 버튼 클릭
export async function handleRecruitButton(
  guildId: string,
  discordUserId: string,
  customId: string,
): Promise<DiscordInteractionResponse> {
  const parsed = parseRecruitCustomId(customId);
  if (!parsed) return ephemeral("알 수 없는 버튼이에요.");

  const ctx = await resolveGroupMember(guildId, discordUserId);
  if ("reply" in ctx) return ctx.reply;
  const { group, user } = ctx;

  const match = await prisma.customMatch.findUnique({
    where: { id: parsed.matchId },
    include: { participants: true },
  });
  if (!match || match.groupId !== group.id) return ephemeral("이미 취소됐거나 없는 모집이에요.");
  if (match.status !== "WAITING") return ephemeral("이미 팀이 확정된 모집이에요.");

  const size = match.recruitSize ?? DEFAULT_RECRUIT_SIZE;
  const hasJoined = match.participants.some((p) => p.userId === user.id);
  const canManage = match.createdBy === user.id || group.ownerId === user.id;

  try {
    switch (parsed.action) {
      case "join": {
        if (hasJoined) return ephemeral("이미 참가했어요.");
        if (match.participants.length >= size) return ephemeral("인원이 다 찼어요.");
        try {
          await prisma.customMatchParticipant.create({ data: { matchId: match.id, userId: user.id } });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            return ephemeral("이미 참가했어요.");
          }
          throw err;
        }
        return { type: 7, data: await renderRecruitMessage(match.id) };
      }

      case "leave": {
        if (!hasJoined) return ephemeral("참가하지 않았어요.");
        await prisma.customMatchParticipant.deleteMany({ where: { matchId: match.id, userId: user.id } });
        return { type: 7, data: await renderRecruitMessage(match.id) };
      }

      case "confirm": {
        if (!canManage) return ephemeral("모집한 사람이나 그룹장만 확정할 수 있어요.");
        if (match.participants.length < MIN_RECRUIT_SIZE) {
          return ephemeral(`최소 ${MIN_RECRUIT_SIZE}명이 있어야 팀을 짤 수 있어요.`);
        }

        const detail = await generateTeams(
          match.id,
          { participantUserIds: match.participants.map((p) => p.userId) },
          { notifyDiscord: false },
        );
        const red = detail.participants.filter((p) => p.assignedTeam === "TEAM_A");
        const blue = detail.participants.filter((p) => p.assignedTeam === "TEAM_B");
        const balance = detail.teamAnalysis ? `\n⚖️ 밸런스 ${detail.teamAnalysis.balancePercent}%` : "";
        return {
          type: 7,
          data: {
            content:
              `🎮 **팀이 확정됐어요!** (${detail.participants.length}명)${balance}\n\n` +
              `🔴 레드팀\n${formatRosterBlock(red)}\n` +
              `🔵 블루팀\n${formatRosterBlock(blue)}`,
            components: [],
          },
        };
      }

      case "cancel": {
        if (!canManage) return ephemeral("모집한 사람이나 그룹장만 모집을 취소할 수 있어요.");
        await deleteMatch(match.id, user.id);
        return { type: 7, data: { content: "❌ 내전 모집이 취소됐어요.", components: [] } };
      }
    }
  } catch (err) {
    // 팀 구성/삭제 쪽에서 던진 의도된 에러(예: 그 사이 그룹을 나간 참가자)는 안내로 보여줌
    if (err instanceof AppError) return ephemeral(err.message);
    throw err;
  }
}
