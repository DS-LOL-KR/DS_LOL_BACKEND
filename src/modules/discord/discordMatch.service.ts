import type { Prisma } from "@prisma/client"; // 내전/유저 행 타입
import { prisma } from "../../config/prisma"; // 내전/참가자 조회
import { AppError } from "../../lib/AppError"; // 결과 입력·재추첨 쪽에서 던진 의도된 에러를 안내 메시지로 바꾸기 위해 사용
import { buildMatchResultEmbed, buildTeamsEmbed } from "../../lib/discordEmbeds"; // 팀/결과 카드 디자인(웹후크 알림과 공용)
import {
  createEvaluation,
  duplicateMatchTeams,
  finishMatch,
  generateTeams,
  getMatchById,
  getMyEvaluatedTargetIds,
} from "../matches/matches.service"; // 웹과 같은 결과 입력/재추첨/한 판 더/평가 로직 재사용
import { ephemeral, resolveGroupMember } from "./discordContext"; // 누른 사람 확인 + 본인만 보이는 안내
import type { DiscordActionRow, DiscordInteractionResponse } from "./discord.types";

// 디스코드 안에서 내전 한 판을 끝까지 진행하게 하는 카드 버튼(2026-09-30).
// /내전모집 [확정] → 팀 카드: [🔴 레드 승] [🔵 블루 승] [🔀 다시 섞기]
//   → 결과 카드: [⭐ 매너 평가] [🔁 같은 팀으로 한 판 더]
// 매너 평가는 누른 사람에게만 보이는 메시지에서 "평가할 사람 고르기 → 1~5점"을 반복함
// (한 메시지에 넣을 수 있는 컴포넌트 줄이 5개뿐이라, 최대 9명을 한 번에 못 넣음).
//
// custom_id 형식
//   match:<win_red|win_blue|reshuffle|rematch|rate>:<matchId>
//   rate:pick:<matchId>                (선택 메뉴 — 고른 값이 평가 대상 userId)
//   rate:score:<matchId>:<targetId>:<score>

const TEAM_CARD_HINT = "경기가 끝나면 아래 버튼으로 이긴 팀을 눌러 주세요";

type Detail = Awaited<ReturnType<typeof getMatchById>>;

export function buildTeamCardButtons(matchId: number): DiscordActionRow[] {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 4, label: "레드 승", emoji: { name: "🔴" }, custom_id: `match:win_red:${matchId}` },
        { type: 2, style: 1, label: "블루 승", emoji: { name: "🔵" }, custom_id: `match:win_blue:${matchId}` },
        { type: 2, style: 2, label: "다시 섞기", emoji: { name: "🔀" }, custom_id: `match:reshuffle:${matchId}` },
      ],
    },
  ];
}

export function buildResultCardButtons(matchId: number): DiscordActionRow[] {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: "매너 평가", emoji: { name: "⭐" }, custom_id: `match:rate:${matchId}` },
        { type: 2, style: 3, label: "같은 팀으로 한 판 더", emoji: { name: "🔁" }, custom_id: `match:rematch:${matchId}` },
      ],
    },
  ];
}

// 팀이 짜인(MATCHED) 판의 카드 — /내전모집 [확정], [다시 섞기], [한 판 더]가 같이 씀
export function buildTeamCard(detail: Detail) {
  return {
    embed: buildTeamsEmbed(detail.id, detail.participants, detail.teamAnalysis, TEAM_CARD_HINT),
    components: buildTeamCardButtons(detail.id),
  };
}

function buildResultEmbedFor(detail: Detail) {
  return buildMatchResultEmbed(detail.id, detail.winningTeam!, detail.participants, new Date());
}

const MATCH_ACTIONS = ["win_red", "win_blue", "reshuffle", "rematch", "rate"] as const;
type MatchAction = (typeof MATCH_ACTIONS)[number];

export function parseMatchCustomId(customId: string): { action: MatchAction; matchId: number } | null {
  const m = /^match:([a-z_]+):(\d+)$/.exec(customId);
  if (!m || !(MATCH_ACTIONS as readonly string[]).includes(m[1])) return null;
  return { action: m[1] as MatchAction, matchId: Number(m[2]) };
}

type LoadedMatch =
  | { reply: DiscordInteractionResponse }
  | {
      match: Prisma.CustomMatchGetPayload<{ include: { participants: true } }>;
      user: Prisma.UserGetPayload<object>;
      isParticipant: boolean;
      canManage: boolean;
    };

// 버튼을 누른 사람이 이 판을 다룰 수 있는지 — 이 판 참가자이거나 그룹장
async function loadMatchForUser(guildId: string, discordUserId: string, matchId: number): Promise<LoadedMatch> {
  const ctx = await resolveGroupMember(guildId, discordUserId);
  if ("reply" in ctx) return { reply: ctx.reply };

  const match = await prisma.customMatch.findUnique({ where: { id: matchId }, include: { participants: true } });
  if (!match || match.groupId !== ctx.group.id) return { reply: ephemeral("이미 삭제됐거나 없는 내전이에요.") };

  const isParticipant = match.participants.some((p) => p.userId === ctx.user.id);
  return { match, user: ctx.user, isParticipant, canManage: isParticipant || ctx.group.ownerId === ctx.user.id };
}

export async function handleMatchButton(
  guildId: string,
  discordUserId: string,
  customId: string,
): Promise<DiscordInteractionResponse> {
  const parsed = parseMatchCustomId(customId);
  if (!parsed) return ephemeral("알 수 없는 버튼이에요.");

  const loaded = await loadMatchForUser(guildId, discordUserId, parsed.matchId);
  if ("reply" in loaded) return loaded.reply;
  const { match, user, canManage, isParticipant } = loaded;

  try {
    switch (parsed.action) {
      case "win_red":
      case "win_blue": {
        if (!canManage) return ephemeral("이 판 참가자나 그룹장만 결과를 입력할 수 있어요.");
        const winningTeam = parsed.action === "win_red" ? "TEAM_A" : "TEAM_B";
        const detail = await finishMatch(match.id, { winningTeam }, { notifyDiscord: false });
        return {
          type: 7,
          data: { embeds: [buildResultEmbedFor(detail)], components: buildResultCardButtons(detail.id) },
        };
      }

      case "reshuffle": {
        if (!canManage) return ephemeral("이 판 참가자나 그룹장만 팀을 다시 섞을 수 있어요.");
        if (match.status !== "MATCHED") return ephemeral("이미 결과가 입력된 판은 다시 섞을 수 없어요.");
        const detail = await generateTeams(
          match.id,
          { participantUserIds: match.participants.map((p) => p.userId) },
          { notifyDiscord: false },
        );
        const card = buildTeamCard(detail);
        return { type: 7, data: { embeds: [card.embed], components: card.components } };
      }

      case "rematch": {
        if (!canManage) return ephemeral("이 판 참가자나 그룹장만 다음 판을 만들 수 있어요.");
        if (match.status !== "FINISHED") return ephemeral("결과가 입력된 판에서만 한 판 더 할 수 있어요.");
        const previous = await getMatchById(match.id);
        const next = await duplicateMatchTeams(match.id);
        const card = buildTeamCard(next);
        // 같은 메시지에 방금 판 결과와 새 판 팀을 같이 보여주고, 버튼은 새 판 것으로 바꿈 —
        // 버튼이 바로 바뀌니까 [한 판 더]를 두 번 눌러 판이 두 개 생기는 일도 막힘.
        return { type: 7, data: { embeds: [buildResultEmbedFor(previous), card.embed], components: card.components } };
      }

      case "rate": {
        if (!isParticipant) return ephemeral("이 판에 참가한 사람만 매너 평가를 할 수 있어요.");
        if (match.status !== "FINISHED") return ephemeral("결과가 입력된 판에서만 평가할 수 있어요.");
        return renderRatePicker(match.id, user.id, 4);
      }
    }
  } catch (err) {
    // 두 사람이 동시에 [레드 승]을 누른 경우 등 — finishMatch가 409로 막고 안내만 보여줌
    if (err instanceof AppError) return ephemeral(err.message);
    throw err;
  }
}

// ---- 매너 평가 (누른 사람에게만 보이는 메시지) ----

// 아직 평가 안 한 사람 목록을 선택 메뉴로. responseType 4 = 새로 띄우기, 7 = 같은 메시지 갱신
async function renderRatePicker(
  matchId: number,
  evaluatorId: number,
  responseType: 4 | 7,
  notice?: string,
): Promise<DiscordInteractionResponse> {
  const [detail, ratedIds] = await Promise.all([getMatchById(matchId), getMyEvaluatedTargetIds(matchId, evaluatorId)]);
  const remaining = detail.participants.filter((p) => p.userId !== evaluatorId && !ratedIds.includes(p.userId));
  const prefix = notice ? `${notice}\n` : "";

  if (remaining.length === 0) {
    return {
      type: responseType,
      data: { content: `${prefix}🎉 이 판 참가자를 모두 평가했어요. 고마워요!`, components: [], flags: 64 },
    };
  }

  return {
    type: responseType,
    data: {
      content: `${prefix}### ⭐ 매너 평가 (내전 #${matchId})\n-# 평가할 사람을 골라 주세요 · 남은 ${remaining.length}명`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 3,
              custom_id: `rate:pick:${matchId}`,
              placeholder: "평가할 사람 선택",
              options: remaining.map((p) => ({
                label: p.nickname,
                value: String(p.userId),
                description: p.assignedTeam === "TEAM_A" ? "레드팀" : "블루팀",
                emoji: { name: p.assignedTeam === "TEAM_A" ? "🔴" : "🔵" },
              })),
            },
          ],
        },
      ],
      flags: 64,
    },
  };
}

function renderScoreButtons(matchId: number, targetId: number, targetNickname: string): DiscordInteractionResponse {
  return {
    type: 7,
    data: {
      content: `### ${targetNickname}님의 매너는 어땠나요?\n-# 1점 = 별로였어요 · 5점 = 최고였어요`,
      components: [
        {
          type: 1,
          components: [1, 2, 3, 4, 5].map((score) => ({
            type: 2 as const,
            style: (score >= 4 ? 3 : score <= 2 ? 4 : 2) as 2 | 3 | 4,
            label: `${score}점`,
            emoji: { name: "⭐" },
            custom_id: `rate:score:${matchId}:${targetId}:${score}`,
          })),
        },
      ],
      flags: 64,
    },
  };
}

export function parseRateCustomId(
  customId: string,
): { kind: "pick"; matchId: number } | { kind: "score"; matchId: number; targetId: number; score: number } | null {
  const pick = /^rate:pick:(\d+)$/.exec(customId);
  if (pick) return { kind: "pick", matchId: Number(pick[1]) };
  const score = /^rate:score:(\d+):(\d+):([1-5])$/.exec(customId);
  if (score) {
    return { kind: "score", matchId: Number(score[1]), targetId: Number(score[2]), score: Number(score[3]) };
  }
  return null;
}

export async function handleRateInteraction(
  guildId: string,
  discordUserId: string,
  customId: string,
  values: string[] | undefined,
): Promise<DiscordInteractionResponse> {
  const parsed = parseRateCustomId(customId);
  if (!parsed) return ephemeral("알 수 없는 버튼이에요.");

  const loaded = await loadMatchForUser(guildId, discordUserId, parsed.matchId);
  if ("reply" in loaded) return loaded.reply;
  const { match, user, isParticipant } = loaded;
  if (!isParticipant) return ephemeral("이 판에 참가한 사람만 매너 평가를 할 수 있어요.");

  if (parsed.kind === "pick") {
    const targetId = Number(values?.[0]);
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { nickname: true } });
    if (!target || !match.participants.some((p) => p.userId === targetId)) {
      return ephemeral("이 판 참가자가 아니에요.");
    }
    return renderScoreButtons(match.id, targetId, target.nickname);
  }

  try {
    await createEvaluation(match.id, user.id, { targetId: parsed.targetId, score: parsed.score });
  } catch (err) {
    // 이미 평가한 사람을 다시 누른 경우(409) 등 — 안내를 붙여서 목록으로 돌아감
    if (err instanceof AppError) return renderRatePicker(match.id, user.id, 7, `⚠️ ${err.message}`);
    throw err;
  }
  const target = await prisma.user.findUnique({ where: { id: parsed.targetId }, select: { nickname: true } });
  return renderRatePicker(match.id, user.id, 7, `✅ ${target?.nickname ?? "상대"}님에게 ⭐${parsed.score}점을 남겼어요.`);
}
