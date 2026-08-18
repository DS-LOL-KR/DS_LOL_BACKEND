import type { NextFunction, Request, Response } from "express"; // Express 미들웨어 함수 시그니처에 필요한 타입
import jwt from "jsonwebtoken"; // 쿠키에 담긴 JWT를 검증/디코딩하기 위해 사용
import { AppError } from "../lib/AppError"; // 인증 실패를 401 에러로 통일해서 던지기 위해 사용
import { env } from "../config/env"; // JWT_SECRET — 서명 검증에 사용

// auth.service.ts의 jwt.sign()에서 담아준 payload 형태와 맞춰야 함
interface AuthTokenPayload {
  id: number;
  email: string;
}

/**
 * auth.controller.ts의 googleCallback에서 심어준 httpOnly 쿠키("token")를 읽어서
 * 검증하고, 통과하면 req.user에 { id, email }을 채워준다.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.token as string | undefined;

  if (!token) {
    next(new AppError(401, "Unauthorized"));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch {
    // 서명이 안 맞거나(위조) 만료된 토큰이거나 — 이유를 구분해서 알려줄 필요는
    // 없고(공격자에게 힌트만 됨), 그냥 401로 통일.
    next(new AppError(401, "Unauthorized"));
  }
}

export default authMiddleware;
