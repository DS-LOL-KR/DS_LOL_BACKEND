import type { NextFunction, Request, Response } from "express"; // Express 미들웨어 함수 시그니처에 필요한 타입
import { AppError } from "../lib/AppError"; // 권한 없음(401/403)/찾을 수 없음(404) 에러를 던지기 위해 사용
import { prisma } from "../config/prisma"; // custom_matches, group_members 테이블 접근

/**
 * GET/POST/PATCH /matches/:id... 는 groupId가 URL에 없어서(matchId만 있음)
 * group.middleware.ts의 requireGroupMember를 그대로 못 씀 — 매치를 먼저 찾아서
 * 그 매치가 속한 그룹의 멤버인지 확인함. authMiddleware만으로는 로그인한 아무나
 * 남의 내전 상세/팀 구성/평가를 다 볼 수 있는 구멍이 있었음(2026-08-27 발견).
 */
export async function requireMatchGroupMember(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    next(new AppError(401, "Unauthorized"));
    return;
  }

  const matchId = Number(req.params.id);
  if (!Number.isInteger(matchId)) {
    next(new AppError(400, "Invalid match id"));
    return;
  }

  try {
    const match = await prisma.customMatch.findUnique({ where: { id: matchId } });
    if (!match) {
      next(new AppError(404, "내전을 찾을 수 없습니다."));
      return;
    }

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: match.groupId, userId: req.user.id } },
    });

    if (!membership) {
      next(new AppError(403, "그룹 멤버만 볼 수 있습니다."));
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
}

export default requireMatchGroupMember;
