import jwt from "jsonwebtoken"; // 디스코드 유저 ID를 위조할 수 없게 서명해서 링크에 담기 위해 사용
import { Prisma } from "@prisma/client"; // discord_user_id 유니크 제약 위반(P2002)을 구분하기 위해 사용
import { prisma } from "../../config/prisma"; // users.discord_user_id 저장/해제
import { env } from "../../config/env"; // JWT_SECRET(서명 키), CORS_ORIGIN(프론트 주소)
import { AppError } from "../../lib/AppError"; // 토큰 위조·만료, 중복 연결을 명확한 에러로 표현하기 위해 사용

// 디스코드 닉네임은 서버마다 다르고 바뀔 수 있어서, 디스코드에서 버튼을 누른 사람이
// 우리 유저 누구인지는 디스코드 유저 ID로만 찾음(2026-09-29). 연결 흐름:
// 연결 안 된 사람이 디스코드에서 /내전모집이나 [참가]를 누름 → 봇이 본인에게만 보이는
// 메시지로 이 링크를 줌 → 웹에서 로그인한 상태로 링크를 열고 확인 →
// POST /api/users/me/discord { token }로 저장. 링크 안의 디스코드 ID는 서명돼 있어서
// 남의 디스코드 ID로 바꿔치기할 수 없음.
const DISCORD_LINK_TOKEN_EXPIRES_IN = "10m";

interface DiscordLinkToken {
  discordUserId: string;
}

// 로그인 쿠키(authMiddleware)와 같은 비밀키로 서명하면, 이 토큰을 쿠키에 넣어
// authMiddleware를 통과시킬 수 있게 됨 — 용도별로 비밀키를 분리해서 막음.
function linkTokenSecret(): string {
  return `${env.JWT_SECRET}:discord-link`;
}

export function buildDiscordLinkUrl(discordUserId: string): string {
  const token = jwt.sign({ discordUserId } satisfies DiscordLinkToken, linkTokenSecret(), {
    expiresIn: DISCORD_LINK_TOKEN_EXPIRES_IN,
  });
  return `${env.CORS_ORIGIN}/discord/link?token=${encodeURIComponent(token)}`;
}

export function verifyDiscordLinkToken(token: string): string {
  try {
    const payload = jwt.verify(token, linkTokenSecret()) as DiscordLinkToken;
    return payload.discordUserId;
  } catch {
    throw new AppError(400, "유효하지 않거나 만료된 연결 링크입니다. 디스코드에서 다시 시도해 주세요.");
  }
}

// API 명세서: POST /users/me/discord
export async function linkDiscordAccount(userId: number, token: string) {
  const discordUserId = verifyDiscordLinkToken(token);

  try {
    return await prisma.user.update({ where: { id: userId }, data: { discordUserId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "이미 다른 계정에 연결된 디스코드 계정입니다.");
    }
    throw err;
  }
}

// API 명세서: DELETE /users/me/discord
export async function unlinkDiscordAccount(userId: number) {
  return prisma.user.update({ where: { id: userId }, data: { discordUserId: null } });
}
