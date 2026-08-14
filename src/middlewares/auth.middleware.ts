import type { NextFunction, Request, Response } from "express"; // Express 미들웨어 함수 시그니처에 필요한 타입
import { AppError } from "../lib/AppError"; // 인증 안 된 요청에 401 에러를 던지기 위해 사용

/**
 * TODO: Authorization 헤더 또는 쿠키에서 JWT를 꺼내 검증하고, payload를 디코딩해서
 * 유저를 조회한 뒤 req.user에 담아야 함.
 * 지금은 인증 안 된 요청을 그냥 막기만 하는 최소 스텁 상태.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new AppError(401, "Unauthorized"));
    return;
  }

  next();
}

export default authMiddleware;
