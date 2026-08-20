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

export default requireGroupOwner;
