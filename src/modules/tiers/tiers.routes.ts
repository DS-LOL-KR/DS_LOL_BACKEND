import { Router } from "express"; // groups.routes.ts에 마운트할 하위 라우터를 만들기 위해 사용
import * as tiersController from "./tiers.controller"; // 각 라우트에 연결할 요청 핸들러
import { requireGroupMember, requireGroupOwner } from "../../middlewares/group.middleware"; // 재계산은 그룹장만, 전체 갱신은 그룹원이면 가능

// groups.routes.ts에서 /groups/:id/tiers로 마운트됨 (authMiddleware도 거기서 적용).
// mergeParams: true 필요 — req.params.id(=groupId)를 그대로 물려받아야 함.
export const groupTiersRouter = Router({ mergeParams: true });

// API 명세서: GET /groups/:id/tiers, GET /groups/:id/tiers?position=MID
groupTiersRouter.get("/", tiersController.listTiers);

// API 명세서: POST /groups/:id/tiers/recalculate
// TODO: 아무나 재계산을 트리거해도 되는지, 그룹장만 되는지 명세서에 명시가 없어
// 일단 requireGroupOwner로 막아둠 — 기획 확인 후 조정.
groupTiersRouter.post("/recalculate", requireGroupOwner, tiersController.recalculateTiers);

// API 명세서: POST /groups/:id/tiers/refresh — 그룹원 전체 라이엇 전적/MMR 한 번에 갱신.
// 개인 "지금 갱신"이 로그인만 하면 누구나 가능한 것(2026-09-19)과 맞춰 그룹원이면 허용.
groupTiersRouter.post("/refresh", requireGroupMember, tiersController.refreshGroupTiers);

export default groupTiersRouter;
