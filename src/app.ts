import express, { type Application, type Request, type Response } from "express"; // Express 앱 생성 및 라우트 핸들러 타입
import helmet from "helmet"; // 기본적인 보안 관련 HTTP 응답 헤더 설정
import cors from "cors"; // 다른 오리진(프론트엔드)에서의 요청을 허용하기 위한 CORS 설정
import cookieParser from "cookie-parser"; // 쿠키에 담긴 JWT 등을 req.cookies로 파싱

import { env } from "./config/env"; // CORS_ORIGIN 등 환경변수 값 사용
import { errorMiddleware } from "./middlewares/error.middleware"; // 모든 라우터 뒤에 붙여서 에러 응답 형식을 통일

// 명세서(API 명세서 데이터베이스) 기준 모듈 구성.
// tiers/matches의 /groups/:id/* 라우트, game-accounts/matches의 /users/me/* 라우트는
// groups.routes.ts / users.routes.ts 안에서 각 모듈 라우터를 하위 마운트하는 방식으로
// 합쳐져 있음 — 별도 최상위 모듈(구 ratings/mmr/riot/scrims)은 삭제하고 여기로 흡수했음.
import { authRouter } from "./modules/auth/auth.routes"; // API 명세서 "설정" 카테고리 (구글 로그인/로그아웃)
import { usersRouter } from "./modules/users/users.routes"; // API 명세서 "프로필 설정" + game-accounts/mmr-history 하위 라우트 포함
import { gameAccountsRouter, gamesRouter } from "./modules/game-accounts/game-accounts.routes"; // API 명세서 "게임 계정 / 전적"
import { groupsRouter } from "./modules/groups/groups.routes"; // API 명세서 "그룹" + tiers/matches 하위 라우트 포함
import { matchesRouter } from "./modules/matches/matches.routes"; // API 명세서 "내전"

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  // Base URL: /api (API 명세서 상단 명시)
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter); // /me/game-accounts, /me/mmr-history 하위 라우트 포함
  app.use("/api/game-accounts", gameAccountsRouter);
  app.use("/api/games", gamesRouter);
  app.use("/api/groups", groupsRouter); // /:id/tiers, /:id/matches 하위 라우트 포함
  app.use("/api/matches", matchesRouter);

  app.use(errorMiddleware);

  return app;
}

export const app = createApp();

export default app;
