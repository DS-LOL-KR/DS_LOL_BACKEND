import type { Request, Response, NextFunction } from "express"; // Express 컨트롤러 함수 시그니처에 필요한 타입
import * as authService from "./auth.service"; // 실제 구글 인증/JWT 발급 로직은 서비스 계층에 위임
import { env } from "../../config/env"; // 쿠키 secure 옵션, 로그인 후 리다이렉트할 프론트엔드 주소
import { googleCallbackQuerySchema } from "./auth.schema"; // 콜백 쿼리(code)가 실제로 있는지 검증
import { logger } from "../../lib/logger"; // 로그인 실패 원인(어느 단계에서 멈췄는지)을 남기기 위해 사용
import { TimeoutError } from "../../lib/withTimeout"; // 구글/DB 단계가 시간 제한에 걸렸는지 구분

const AUTH_COOKIE_NAME = "token";
// JWT_EXPIRES_IN(기본 7d)과 눈대중으로 맞춰둔 쿠키 수명. 실제 인증 여부는 서버가
// jwt.verify()로 매번 다시 검증하므로 이 값 자체가 보안에 영향을 주진 않고, 그냥
// "만료된 토큰을 브라우저가 계속 들고 있지 않게" 하는 정도의 UX용 설정임.
// TODO: JWT_EXPIRES_IN을 바꾸면 이 값도 같이 맞춰줘야 함 — 지금은 수동 동기화.
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// 프론트/백엔드가 서로 다른 도메인(예: Vercel + ngrok)이면 쿠키 관점에서
// cross-site라, SameSite=None + Secure가 아니면 브라우저가 로그인 직후
// /api/users/me 같은 fetch 요청에 쿠키를 안 실어 보내서 계속 401이 남
// (localhost 프록시로 같은 origin처럼 보이는 로컬 개발 환경만 lax로 충분).
// set/clearCookie 양쪽에서 옵션이 어긋나면 로그아웃 시 쿠키가 실제로는 안
// 지워지는 문제가 생겨서, 옵션을 여기 한 곳에서만 정의해 공유함.
function getAuthCookieOptions() {
  return {
    httpOnly: true, // JS에서 document.cookie로 못 읽게 — XSS로 토큰 탈취 방지
    secure: env.NODE_ENV === "production" || env.isCrossSiteDeployment,
    sameSite: (env.isCrossSiteDeployment ? "none" : "lax") as "none" | "lax",
  };
}

// GET /auth/google
export async function googleAuth(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const url = await authService.buildGoogleAuthUrl();
    res.redirect(url);
  } catch (err) {
    next(err);
  }
}

// GET /auth/google/callback
// 사용자의 브라우저가 구글에서 리다이렉트되어 오는 곳이라, 실패해도 JSON을 보여주면
// 화면에 에러 텍스트만 뜨거나(구글 인증 실패, 콜백 새로고침 등) 응답이 없으면 무한 로딩이
// 됨(2026-10-04). 실패하면 원인을 로그로 남기고 프론트 로그인 페이지로 돌려보냄 —
// 프론트는 ?loginError=1을 보고 "다시 시도해 주세요"를 띄움.
export async function googleCallback(req: Request, res: Response): Promise<void> {
  try {
    const parsed = googleCallbackQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new Error("missing code (user cancelled or invalid callback)");
    }

    const { token } = await authService.handleGoogleCallback(parsed.data);

    res.cookie(AUTH_COOKIE_NAME, token, {
      ...getAuthCookieOptions(),
      maxAge: AUTH_COOKIE_MAX_AGE_MS,
    });

    // 브라우저가 구글에서 리다이렉트되어 GET으로 여기 도착한 상태라, JSON을
    // 그대로 응답하면 화면에 텍스트만 뜸 — 로그인 완료 후 프론트엔드로 돌려보냄.
    res.redirect(env.CORS_ORIGIN);
  } catch (err) {
    logger.error("Google login callback failed", {
      step: err instanceof TimeoutError ? err.step : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
    res.redirect(`${env.CORS_ORIGIN}/login?loginError=1`);
  }
}

// POST /auth/logout
// 서버가 상태를 갖지 않는(stateless) JWT라 서버 쪽에서 따로 무효화할 게 없음 —
// 클라이언트에 심어둔 쿠키를 지우는 것만으로 로그아웃 처리가 끝남.
export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie(AUTH_COOKIE_NAME, getAuthCookieOptions());
  res.status(204).send();
}
