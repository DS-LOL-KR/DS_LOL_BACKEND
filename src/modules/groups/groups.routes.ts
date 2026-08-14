import { Router } from "express"; // 이 모듈만의 하위 라우터를 만들기 위해 사용
import * as groupsController from "./groups.controller"; // 각 라우트에 연결할 요청 핸들러
import { validate } from "../../middlewares/validate"; // 요청 바디를 zod 스키마로 검증하는 미들웨어
import { authMiddleware } from "../../middlewares/auth.middleware"; // 로그인한 유저만 접근하도록 막는 미들웨어
import { requireGroupOwner } from "../../middlewares/group.middleware"; // 그룹장(OWNER)만 허용하는 미들웨어
import { createGroupSchema, joinGroupSchema, transferOwnerSchema } from "./groups.schema"; // 각 라우트의 요청 바디 검증용 스키마
// /groups/:id/tiers*, /groups/:id/matches*는 명세서상 각각 "티어", "내전" 카테고리라
// 로직은 tiers, matches 모듈에 두고 라우팅만 groupId 하위에 합침 (mergeParams 필요).
import { groupTiersRouter } from "../tiers/tiers.routes"; // /:id/tiers 하위 라우트
import { groupMatchesRouter } from "../matches/matches.routes"; // /:id/matches 하위 라우트

export const groupsRouter = Router();

groupsRouter.post("/", authMiddleware, validate(createGroupSchema), groupsController.createGroup);
groupsRouter.get("/", authMiddleware, groupsController.listGroups);
groupsRouter.post("/join", authMiddleware, validate(joinGroupSchema), groupsController.joinGroup);

groupsRouter.get("/:id", authMiddleware, groupsController.getGroup);
groupsRouter.delete("/:id", authMiddleware, requireGroupOwner, groupsController.deleteGroup);
groupsRouter.patch(
  "/:id/owner",
  authMiddleware,
  requireGroupOwner,
  validate(transferOwnerSchema),
  groupsController.transferOwner,
);
groupsRouter.post(
  "/:id/invite-code/refresh",
  authMiddleware,
  requireGroupOwner,
  groupsController.refreshInviteCode,
);
groupsRouter.delete("/:id/members/me", authMiddleware, groupsController.leaveGroup);
groupsRouter.delete(
  "/:id/members/:userId",
  authMiddleware,
  requireGroupOwner,
  groupsController.removeMember,
);

// API 명세서: GET /groups/:id/tiers, GET /groups/:id/tiers?position=, POST /groups/:id/tiers/recalculate
groupsRouter.use("/:id/tiers", authMiddleware, groupTiersRouter);

// API 명세서: POST/GET /groups/:id/matches
groupsRouter.use("/:id/matches", authMiddleware, groupMatchesRouter);

export default groupsRouter;
