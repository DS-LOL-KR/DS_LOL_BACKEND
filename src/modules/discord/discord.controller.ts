import type { Request, Response, NextFunction } from "express"; // Express 컨트롤러 함수 시그니처에 필요한 타입
import nacl from "tweetnacl"; // 디스코드 인터랙션 요청의 Ed25519 서명을 검증하기 위해 사용
import { env } from "../../config/env"; // DISCORD_PUBLIC_KEY
import { logger } from "../../lib/logger"; // 알 수 없는 명령어/처리 실패를 로그로 남기기 위해 사용
import { buildLatestMatchReply, buildPlayerStatsReply, buildTierTableReply } from "./discord.service";
import type { DiscordInteraction, DiscordInteractionResponse } from "./discord.types";

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

      let content: string;
      if (!guildId) {
        content = "이 명령어는 서버(길드) 안에서만 사용할 수 있어요.";
      } else if (commandName === "티어표") {
        content = await buildTierTableReply(guildId);
      } else if (commandName === "전적") {
        const nickname = getOptionValue(body.data, "닉네임");
        content = nickname ? await buildPlayerStatsReply(guildId, nickname) : "닉네임을 입력해주세요.";
      } else if (commandName === "내전결과") {
        content = await buildLatestMatchReply(guildId);
      } else {
        logger.error("Unknown discord slash command", { commandName });
        content = "아직 지원하지 않는 명령어예요.";
      }

      res.status(200).json({ type: 4, data: { content } } satisfies DiscordInteractionResponse);
      return;
    }

    // 우리가 다루지 않는 인터랙션 타입(예: 버튼 등 컴포넌트) — 조용히 PONG만.
    res.status(200).json({ type: 1 } satisfies DiscordInteractionResponse);
  } catch (err) {
    next(err);
  }
}
