import type { NextFunction, Request, Response } from "express"; // Express 미들웨어 함수 시그니처에 필요한 타입
import { AppError } from "../lib/AppError"; // 권한 없음(401) 에러를 던지기 위해 사용

/**
 * 기능명세서: "그룹장 위임" / "그룹 추방" / "그룹 삭제" / "초대 링크·코드 재발급" 등
 * 그룹장(OWNER)만 할 수 있는 동작들의 공통 권한 체크.
 * TODO: req.user + req.params.id(groupId)로 GroupMember 행을 조회해서
 * role === "OWNER"인지 확인한 뒤에만 요청을 통과시켜야 함.
 */
export function requireGroupOwner(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new AppError(401, "Unauthorized"));
    return;
  }

  // TODO: 실제 DB 조회로 교체 필요 (groupId + userId로 GroupMember를 찾아서
  // role === "OWNER"인지 확인).
  next();
}

export default requireGroupOwner;
