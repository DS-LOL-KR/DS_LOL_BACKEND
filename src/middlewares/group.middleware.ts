import type { NextFunction, Request, Response } from "express"; // Express 미들웨어 함수 시그니처에 필요한 타입
import { AppError } from "../lib/AppError"; // 권한 없음(401/403) 에러를 던지기 위해 사용
import { prisma } from "../config/prisma"; // 그룹장 여부를 실제 group_members 테이블에서 확인하기 위해 사용

/**
 * 기능명세서: "그룹장 위임" / "그룹 추방" / "그룹 삭제" / "초대 링크·코드 재발급" 등
 * 그룹장(OWNER)만 할 수 있는 동작들의 공통 권한 체크.
 * req.params.id(groupId) + req.user.id로 group_members를 조회해서
 * role === "OWNER"일 때만 통과시킴.
 */
export async function requireGroupOwner(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    next(new AppError(401, "Unauthorized"));
    return;
  }

  const groupId = Number(req.params.id);
  if (!Number.isInteger(groupId)) {
    next(new AppError(400, "Invalid group id"));
    return;
  }

  try {
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: req.user.id } },
    });

    if (!membership || membership.role !== "OWNER") {
      next(new AppError(403, "그룹장만 할 수 있는 작업입니다."));
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /groups/:id, /groups/:id/tiers, /groups/:id/matches 등 "그룹 멤버라면 누구나
 * 볼 수 있는" 조회에 씀. authMiddleware만으로는 "로그인은 했지만 이 그룹과 무관한
 * 다른 유저"까지 막지 못해서, 로그인한 아무나 그룹 ID만 알면 남의 그룹 로스터·
 * 티어표·MMR을 다 볼 수 있는 구멍이 있었음(실제로 다른 계정으로 겪음, 2026-08-27
 * 발견) — requireGroupOwner와 같은 패턴으로, OWNER든 MEMBER든 멤버이기만 하면 통과.
 */
export async function requireGroupMember(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    next(new AppError(401, "Unauthorized"));
    return;
  }

  const groupId = Number(req.params.id);
  if (!Number.isInteger(groupId)) {
    next(new AppError(400, "Invalid group id"));
    return;
  }

  try {
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: req.user.id } },
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

export default requireGroupOwner;
