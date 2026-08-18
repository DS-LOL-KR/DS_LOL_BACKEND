import type { Request, Response, NextFunction } from "express"; // Express 컨트롤러 함수 시그니처에 필요한 타입
import * as authService from "./auth.service"; // 실제 구글 인증/JWT 발급 로직은 서비스 계층에 위임
import { env } from "../../config/env"; // 쿠키 secure 옵션, 로그인 후 리다이렉트할 프론트엔드 주소
import { googleCallbackQuerySchema } from "./auth.schema"; // 콜백 쿼리(code)가 실제로 있는지 검증
import { AppError } from "../../lib/AppError"; // 쿼리 검증 실패를 400으로 표현하기 위해 사용

const AUTH_COOKIE_NAME = "token";
// JWT_EXPIRES_IN(기본 7d)과 눈대중으로 맞춰둔 쿠키 수명. 실제 인증 여부는 서버가
// jwt.verify()로 매번 다시 검증하므로 이 값 자체가 보안에 영향을 주진 않고, 그냥
// "만료된 토큰을 브라우저가 계속 들고 있지 않게" 하는 정도의 UX용 설정임.
// TODO: JWT_EXPIRES_IN을 바꾸면 이 값도 같이 맞춰줘야 함 — 지금은 수동 동기화.
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
export async function googleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = googleCallbackQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new AppError(400, "Invalid callback query", parsed.error.flatten()));
      return;
    }

    const { token } = await authService.handleGoogleCallback(parsed.data);

    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true, // JS에서 document.cookie로 못 읽게 — XSS로 토큰 탈취 방지
      secure: env.NODE_ENV === "production", // 로컬(http)에서는 꺼야 브라우저가 쿠키를 버리지 않음
      sameSite: "lax",
      maxAge: AUTH_COOKIE_MAX_AGE_MS,
    });

    // 브라우저가 구글에서 리다이렉트되어 GET으로 여기 도착한 상태라, JSON을
    // 그대로 응답하면 화면에 텍스트만 뜸 — 로그인 완료 후 프론트엔드로 돌려보냄.
    res.redirect(env.CORS_ORIGIN);
  } catch (err) {
    next(err);
  }
}

// POST /auth/logout
// 서버가 상태를 갖지 않는(stateless) JWT라 서버 쪽에서 따로 무효화할 게 없음 —
// 클라이언트에 심어둔 쿠키를 지우는 것만으로 로그아웃 처리가 끝남.
export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie(AUTH_COOKIE_NAME);
  res.status(204).send();
}
