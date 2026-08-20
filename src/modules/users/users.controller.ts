import type { Request, Response, NextFunction } from "express"; // Express 컨트롤러 함수 시그니처에 필요한 타입
import * as usersService from "./users.service"; // 실제 프로필 조회/수정 로직은 서비스 계층에 위임
import { AppError } from "../../lib/AppError"; // :id가 숫자가 아닐 때 400으로 명확하게 막기 위해 사용

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
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      next(new AppError(400, "Invalid user id"));
      return;
    }

    const user = await usersService.getUserById(id);
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
// req.file은 profileImageUpload 미들웨어(라우트에서 이 핸들러보다 먼저 실행)가
// 채워줌 — 그 미들웨어가 이미 파일 없음/형식/용량 문제를 다 걸러내므로 여기서는
// req.file이 항상 있다고 가정해도 되지만, 방어적으로 한 번 더 확인.
export async function updateProfileImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      next(new AppError(400, "업로드할 파일이 없습니다."));
      return;
    }

    const user = await usersService.updateProfileImage(req.user!.id, req.file.filename);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}
