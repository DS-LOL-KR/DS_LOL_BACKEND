import { Router } from "express"; // 이 모듈에서 쓸 3개의 하위 라우터(group 하위/최상위/me)를 만들기 위해 사용
import * as matchesController from "./matches.controller"; // 각 라우트에 연결할 요청 핸들러
import { validate } from "../../middlewares/validate"; // 요청 바디를 zod 스키마로 검증하는 미들웨어
// 각 라우트의 요청 바디 검증용 스키마
import {
  createMatchSchema,
  createEvaluationSchema,
  finishMatchSchema,
  generateTeamsSchema,
  updateTeamsSchema,
} from "./matches.schema";

// groups.routes.ts에서 /groups/:id/matches로 마운트됨 (mergeParams 필요, authMiddleware는 거기서 적용)
export const groupMatchesRouter = Router({ mergeParams: true });

groupMatchesRouter.post("/", validate(createMatchSchema), matchesController.createMatch);
groupMatchesRouter.get("/", matchesController.listMatchesForGroup);

// app.ts에서 /api/matches로 마운트
export const matchesRouter = Router();

matchesRouter.get("/:id", matchesController.getMatch);
matchesRouter.post(
  "/:id/teams/generate",
  validate(generateTeamsSchema),
  matchesController.generateTeams,
);
matchesRouter.patch("/:id/teams", validate(updateTeamsSchema), matchesController.updateTeams);
matchesRouter.post("/:id/finish", validate(finishMatchSchema), matchesController.finishMatch);
matchesRouter.post(
  "/:id/evaluations",
  validate(createEvaluationSchema),
  matchesController.createEvaluation,
);
matchesRouter.get("/:id/mmr-changes", matchesController.getMmrChangesForMatch);

// users.routes.ts에서 /me/mmr-history로 마운트됨 (authMiddleware는 거기서 적용)
export const myMmrHistoryRouter = Router();

myMmrHistoryRouter.get("/", matchesController.getMyMmrHistory);

export default matchesRouter;
