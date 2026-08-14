import type { Request, Response, NextFunction } from "express"; // Express 컨트롤러 함수 시그니처에 필요한 타입
import * as authService from "./auth.service"; // 실제 로그인/로그아웃 로직은 서비스 계층에 위임

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
    const result = await authService.handleGoogleCallback(req.query as never);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// POST /auth/logout
export async function logout(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.logout();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
