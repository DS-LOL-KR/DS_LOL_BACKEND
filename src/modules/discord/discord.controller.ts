import type { Request, Response, NextFunction } from "express"; // Express 컨트롤러 함수 시그니처에 필요한 타입
import nacl from "tweetnacl"; // 디스코드 인터랙션 요청의 Ed25519 서명을 검증하기 위해 사용
import { env } from "../../config/env"; // DISCORD_PUBLIC_KEY, CORS_ORIGIN(프론트로 되돌려보낼 때 씀)
import { logger } from "../../lib/logger"; // 알 수 없는 명령어/처리 실패를 로그로 남기기 위해 사용
import { updateDiscordGuild } from "../groups/groups.service"; // OAuth 콜백에서 받은 guild_id를 그룹에 저장
import {
  buildLatestMatchReply,
  buildPlayerStatsReply,
  buildTierTableReply,
  verifyDiscordOAuthState,
} from "./discord.service";
import { DEFAULT_RECRUIT_SIZE, handleRecruitButton, startRecruit } from "./discordRecruit.service"; // /내전모집 + 모집 버튼
import { handleMatchButton, handleRateInteraction } from "./discordMatch.service"; // 팀·결과 카드 버튼 + 매너 평가
import {
  DISCORD_EPHEMERAL_FLAG,
  type DiscordInteraction,
  type DiscordInteractionResponse,
  type DiscordMessageData,
} from "./discord.types";

// 디스코드는 이 엔드포인트를 호출할 때마다 X-Signature-Ed25519/X-Signature-Timestamp
// 헤더를 실어 보내고, (timestamp + 원본 바디)를 그 서명으로 검증하길 요구함 —
// 우리 서버가 실제로 디스코드가 등록한 애플리케이션인지 확인하는 절차라, 통과 못하면
// 401로 거부해야 함(그래야 Developer Portal의 "Interactions Endpoint URL" 저장이
// 성공함). req.rawBody는 app.ts의 express.json({ verify }) 콜백에서 채워짐 —
// JSON.stringify로 재조합하면 원본 바이트와 한 글자라도 달라져 서명이 깨질 수 있어서
// 반드시 파싱 전 원본 버퍼를 그대로 써야 함.
function verifySignature(req: Request): boolean {
  const signature = req.header("X-Signature-Ed25519");
  const timestamp = req.header("X-Signature-Timestamp");
  if (!signature || !timestamp || !req.rawBody || !env.DISCORD_PUBLIC_KEY) return false;

  try {
    return nacl.sign.detached.verify(
      Buffer.concat([Buffer.from(timestamp, "utf8"), req.rawBody]),
      Buffer.from(signature, "hex"),
      Buffer.from(env.DISCORD_PUBLIC_KEY, "hex"),
    );
  } catch {
    // 헤더 값이 hex가 아니거나 길이가 안 맞는 등 malformed 요청 — 서명 불일치와
    // 동일하게 취급(401)하지, 500으로 새지 않게 방어적으로 잡음.
    return false;
  }
}

function getOptionValue(data: DiscordInteraction["data"], name: string): string | undefined {
  const option = data?.options?.find((o) => o.name === name);
  return typeof option?.value === "string" ? option.value : undefined;
}

function getNumberOptionValue(data: DiscordInteraction["data"], name: string): number | undefined {
  const option = data?.options?.find((o) => o.name === name);
  return typeof option?.value === "number" ? option.value : undefined;
}

// 서버 안에서 누르면 member.user, DM이면 user로 옴
function getDiscordUserId(body: DiscordInteraction): string | undefined {
  return body.member?.user.id ?? body.user?.id;
}

// API 명세서 없음(디스코드 쪽 계약) — POST /api/discord/interactions
// 디스코드 Developer Portal의 "Interactions Endpoint URL"에 이 경로를 등록해두면
// 슬래시 명령어 입력마다 디스코드가 이 엔드포인트로 호출함.
export async function handleInteraction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!verifySignature(req)) {
      res.status(401).send("invalid request signature");
      return;
    }

    const body = req.body as DiscordInteraction;

    // type 1(PING) — Developer Portal에 엔드포인트 URL을 등록/저장할 때마다
    // 디스코드가 한 번 보내서 살아있는지 확인함. PONG(type 1)으로 그대로 응답.
    if (body.type === 1) {
      res.status(200).json({ type: 1 } satisfies DiscordInteractionResponse);
      return;
    }

    // type 2(APPLICATION_COMMAND) — 실제 슬래시 명령어 실행.
    if (body.type === 2) {
      const guildId = body.guild_id;
      const commandName = body.data?.name;
      const discordUserId = getDiscordUserId(body);

      // /내전모집은 버튼이 붙은 메시지를 통째로 돌려줘서 아래 content 한 줄짜리 흐름과 따로 처리
      if (commandName === "내전모집" && guildId && discordUserId) {
        const size = getNumberOptionValue(body.data, "인원") ?? DEFAULT_RECRUIT_SIZE;
        res.status(200).json(await startRecruit(guildId, discordUserId, size));
        return;
      }

      // 결과는 임베드, "서버 안에서만 돼요" 같은 안내는 누른 사람에게만 보이는 짧은 글
      const onlyYou = (content: string): DiscordMessageData => ({ content, flags: DISCORD_EPHEMERAL_FLAG });
      let data: DiscordMessageData;
      if (!guildId) {
        data = onlyYou("이 명령어는 서버(길드) 안에서만 사용할 수 있어요.");
      } else if (commandName === "티어표") {
        data = await buildTierTableReply(guildId);
      } else if (commandName === "전적") {
        const nickname = getOptionValue(body.data, "닉네임");
        data = nickname ? await buildPlayerStatsReply(guildId, nickname) : onlyYou("닉네임을 입력해 주세요.");
      } else if (commandName === "내전결과") {
        data = await buildLatestMatchReply(guildId);
      } else {
        logger.error("Unknown discord slash command", { commandName });
        data = onlyYou("아직 지원하지 않는 명령어예요.");
      }

      res.status(200).json({ type: 4, data } satisfies DiscordInteractionResponse);
      return;
    }

    // type 3(MESSAGE_COMPONENT) — 모집 메시지·팀/결과 카드의 버튼, 매너 평가 선택 메뉴.
    if (body.type === 3) {
      const guildId = body.guild_id;
      const discordUserId = getDiscordUserId(body);
      const customId = body.data?.custom_id;
      if (guildId && discordUserId && customId) {
        if (customId.startsWith("recruit:")) {
          res.status(200).json(await handleRecruitButton(guildId, discordUserId, customId));
          return;
        }
        if (customId.startsWith("match:")) {
          res.status(200).json(await handleMatchButton(guildId, discordUserId, customId));
          return;
        }
        if (customId.startsWith("rate:")) {
          res.status(200).json(await handleRateInteraction(guildId, discordUserId, customId, body.data?.values));
          return;
        }
      }
    }

    // 우리가 다루지 않는 인터랙션 — 조용히 PONG만.
    res.status(200).json({ type: 1 } satisfies DiscordInteractionResponse);
  } catch (err) {
    next(err);
  }
}

// GET /api/discord/oauth/callback
// "봇 초대 → 자동으로 그룹에 연동" 흐름의 도착지. groups.controller.ts의
// getDiscordInviteUrl로 만든 링크를 타고 사용자가 디스코드에서 서버 선택/승인을
// 마치면 브라우저가 이 URL로 리다이렉트되어 옴 — 디스코드가 서버(HTTP)로 직접
// 호출하는 게 아니라 "사용자 브라우저"가 오는 표준 OAuth2 리다이렉트라서
// handleInteraction과 달리 서명 검증이 필요 없음(대신 우리가 발급한 state로 검증).
// 성공/실패 모두 화면에 보여줄 게 있어야 해서 JSON이 아니라 프론트로 리다이렉트함.
export async function handleOAuthCallback(req: Request, res: Response): Promise<void> {
  const { state, guild_id: guildId } = req.query as { state?: string; guild_id?: string };

  let groupId: number | null = null;
  try {
    if (!state) throw new Error("missing state");
    groupId = verifyDiscordOAuthState(state);
    if (!guildId) throw new Error("missing guild_id (사용자가 서버 선택 없이 취소했거나 scope가 빠짐)");

    await updateDiscordGuild(groupId, { guildId });
  } catch (err) {
    logger.error("Discord OAuth callback failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    const target = groupId ? `${env.CORS_ORIGIN}/groups/${groupId}/manage` : `${env.CORS_ORIGIN}/groups`;
    res.redirect(`${target}?discordLinkError=1`);
    return;
  }

  res.redirect(`${env.CORS_ORIGIN}/groups/${groupId}/manage?discordLinked=1`);
}
