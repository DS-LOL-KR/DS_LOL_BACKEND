import { Router } from "express"; // 이 모듈에서 쓸 3개의 하위 라우터(me/전체/games)를 만들기 위해 사용
import * as gameAccountsController from "./game-accounts.controller"; // 각 라우트에 연결할 요청 핸들러
import { validate } from "../../middlewares/validate"; // 요청 바디를 zod 스키마로 검증하는 미들웨어
import { authMiddleware } from "../../middlewares/auth.middleware"; // 로그인한 유저만 접근하도록 막는 미들웨어
import { createGameAccountSchema } from "./game-accounts.schema"; // POST 요청 바디 검증용 스키마

// 명세서: API 명세서 > 게임 계정 / 전적
// users.routes.ts에서 /me/game-accounts로 마운트됨 (authMiddleware는 거기서 적용).
export const meGameAccountsRouter = Router();

meGameAccountsRouter.post("/", validate(createGameAccountSchema), gameAccountsController.createGameAccount);
meGameAccountsRouter.get("/", gameAccountsController.listMyGameAccounts);
meGameAccountsRouter.delete("/:id", gameAccountsController.deleteGameAccount);

// app.ts에서 /api/game-accounts로 마운트
// 원래 여기 authMiddleware가 빠져있어서 로그인 안 해도 아무 계정이나 조회/갱신
// 가능한 구멍이 있었음 — 여기서 막음. (refresh는 서비스 계층에서 소유자만 되게
// 추가로 한 번 더 체크함, stats 조회는 로그인만 하면 누구든 볼 수 있게 둠 —
// 그룹 내 다른 사람 티어를 볼 수 있어야 하는 기능 특성상.)
export const gameAccountsRouter = Router();

gameAccountsRouter.use(authMiddleware);
gameAccountsRouter.post("/:id/refresh", gameAccountsController.refreshGameAccountStats);
gameAccountsRouter.get("/:id/stats", gameAccountsController.getGameAccountStats);
gameAccountsRouter.post("/:id/match-history/sync", gameAccountsController.syncMatchHistory);
gameAccountsRouter.get("/:id/match-history", gameAccountsController.listMatchHistory);
gameAccountsRouter.get("/:id/champion-masteries", gameAccountsController.listChampionMasteries);
gameAccountsRouter.get("/:id/champion-stats", gameAccountsController.getChampionStats);

// app.ts에서 /api/games로 마운트 (기능명세서: "게임 종목 선택")
export const gamesRouter = Router();

gamesRouter.get("/", gameAccountsController.listGames);

export default gameAccountsRouter;
