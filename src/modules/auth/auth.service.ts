import { OAuth2Client } from "google-auth-library"; // 구글과 통신(인증 URL 생성, code 교환, id_token 검증)하기 위해 사용
import jwt from "jsonwebtoken"; // 우리 서비스 자체 JWT를 발급하기 위해 사용
import { prisma } from "../../config/prisma"; // 구글로 확인된 유저를 users 테이블에 upsert하기 위해 사용
import { env } from "../../config/env"; // GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI, JWT_SECRET 등
import { AppError } from "../../lib/AppError"; // 구글 인증 실패를 401로 명확하게 표현하기 위해 사용
import type { GoogleCallbackQuery } from "./auth.schema"; // 콜백 쿼리(code)의 형태를 명시하기 위해 사용
import { withTimeout } from "../../lib/withTimeout"; // 구글/DB 호출이 멈춰도 로그인 화면이 무한 로딩되지 않게 단계별 시간 제한

// GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI를 하나로 묶은 구글 전용 클라이언트.
// 요청마다 새로 만들 필요 없어서 모듈 로드 시 한 번만 생성해 재사용.
const oauth2Client = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI,
);

// 기능명세서: "로그인" — 구글 OAuth로 로그인
// API 명세서: GET /auth/google
export async function buildGoogleAuthUrl(): Promise<string> {
  return oauth2Client.generateAuthUrl({
    // 로그인 시점의 프로필만 필요하고 이후에 구글 API를 대신 호출할 일이 없어서,
    // refresh_token까지 받는 "offline"이 아니라 "online"이면 충분함.
    access_type: "online",
    scope: ["openid", "email", "profile"],
  });
}

// 기능명세서: "로그인" — 구글 OAuth 콜백 처리
// API 명세서: GET /auth/google/callback
// 흐름: 1) code를 구글 토큰으로 교환 → 2) id_token을 검증해서 구글이 보증한 값인지
// 확인 → 3) email로 users 테이블 upsert(신규면 생성, 기존이면 그대로) →
// 4) 우리 서비스 자체 JWT 발급.
// 각 단계에 시간 제한을 걸어서, 하나라도 멈추면 TimeoutError(step)로 끝남 — 컨트롤러가
// 로그를 남기고 로그인 페이지로 돌려보냄.
const GOOGLE_STEP_TIMEOUT_MS = 8_000;
const DB_STEP_TIMEOUT_MS = 5_000;

export async function handleGoogleCallback(
  query: GoogleCallbackQuery,
): Promise<{ token: string; userId: number }> {
  const { tokens } = await withTimeout(
    oauth2Client.getToken(query.code),
    GOOGLE_STEP_TIMEOUT_MS,
    "google token exchange",
  );

  if (!tokens.id_token) {
    throw new AppError(401, "구글로부터 id_token을 받지 못했습니다.");
  }

  // 구글 공개 인증서(www.googleapis.com/oauth2/v1/certs)를 받아오는 단계 — 응답이 커서
  // 네트워크 MTU 문제가 있으면 여기서 멈춤(2026-10-04 실제로 발생).
  const ticket = await withTimeout(
    oauth2Client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID }),
    GOOGLE_STEP_TIMEOUT_MS,
    "google id_token verification",
  );
  const payload = ticket.getPayload();

  // email_verified === true인 경우만 신뢰함 — 구글이 실제로 소유권을 확인한
  // 이메일이라는 뜻이라, 이걸로 users.email을 매칭해도 안전함.
  if (!payload?.email || !payload.email_verified) {
    throw new AppError(401, "이메일이 확인되지 않은 구글 계정입니다.");
  }

  // 구글 이름/사진은 처음 가입할 때만 기본값으로 씀. 예전엔 update에도 넣어서, 웹에서
  // 닉네임이나 프로필 사진을 바꿔도 다음 로그인 때마다 구글 값으로 되돌아갔음(2026-10-04 수정).
  const user = await withTimeout(
    prisma.user.upsert({
      where: { email: payload.email },
      update: {},
      create: {
        email: payload.email,
        nickname: payload.name ?? payload.email,
        profileImageUrl: payload.picture,
      },
    }),
    DB_STEP_TIMEOUT_MS,
    "user upsert",
  );

  const token = jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });

  return { token, userId: user.id };
}
