import type { Request, Response, NextFunction } from "express"; // Express 컨트롤러 함수 시그니처에 필요한 타입
import * as usersService from "./users.service"; // 실제 프로필 조회/수정 로직은 서비스 계층에 위임

// GET /users/me
export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await usersService.getMe(req.user!.id);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

// GET /users/:id
export async function getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await usersService.getUserById(Number(req.params.id));
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

// PATCH /users/me
export async function updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await usersService.updateMe(req.user!.id, req.body);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

// POST /users/me/profile-image
export async function updateProfileImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // TODO: multer 등으로 req.file 채워지도록 라우트에 업로드 미들웨어 추가 필요.
    const user = await usersService.updateProfileImage(req.user!.id, (req as { file?: unknown }).file);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}
