import { Router } from "express"; // 이 모듈에서 쓸 3개의 하위 라우터(me/전체/games)를 만들기 위해 사용
import * as gameAccountsController from "./game-accounts.controller"; // 각 라우트에 연결할 요청 핸들러
import { validate } from "../../middlewares/validate"; // 요청 바디를 zod 스키마로 검증하는 미들웨어
import { createGameAccountSchema } from "./game-accounts.schema"; // POST 요청 바디 검증용 스키마

// 명세서: API 명세서 > 게임 계정 / 전적
// users.routes.ts에서 /me/game-accounts로 마운트됨 (authMiddleware는 거기서 적용).
export const meGameAccountsRouter = Router();

meGameAccountsRouter.post("/", validate(createGameAccountSchema), gameAccountsController.createGameAccount);
meGameAccountsRouter.get("/", gameAccountsController.listMyGameAccounts);
meGameAccountsRouter.delete("/:id", gameAccountsController.deleteGameAccount);

// app.ts에서 /api/game-accounts로 마운트
export const gameAccountsRouter = Router();

gameAccountsRouter.post("/:id/refresh", gameAccountsController.refreshGameAccountStats);
gameAccountsRouter.get("/:id/stats", gameAccountsController.getGameAccountStats);

// app.ts에서 /api/games로 마운트 (기능명세서: "게임 종목 선택")
export const gamesRouter = Router();

gamesRouter.get("/", gameAccountsController.listGames);

export default gameAccountsRouter;
