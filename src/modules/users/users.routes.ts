import { Router } from "express"; // 이 모듈만의 하위 라우터를 만들기 위해 사용
import * as usersController from "./users.controller"; // 각 라우트에 연결할 요청 핸들러
import { validate } from "../../middlewares/validate"; // 요청 바디를 zod 스키마로 검증하는 미들웨어
import { authMiddleware } from "../../middlewares/auth.middleware"; // 로그인한 유저만 접근하도록 막는 미들웨어
import { updateMeSchema } from "./users.schema"; // PATCH /users/me 요청 바디 검증용 스키마
import { profileImageUpload } from "./profileImageUpload.middleware"; // multipart 파일을 로컬 디스크에 저장 + req.file 채움
// 명세서상 /users/me/game-accounts, /users/me/mmr-history는 "프로필 설정"이 아니라
// 각각 "게임 계정 / 전적", "내전" 카테고리에 속하지만 URL 경로는 /users 아래에 있음.
// 그래서 로직은 각 모듈(game-accounts, matches)에 두고, 라우팅만 여기서 합침.
import { meGameAccountsRouter } from "../game-accounts/game-accounts.routes"; // /me/game-accounts 하위 라우트
import { myMmrHistoryRouter } from "../matches/matches.routes"; // /me/mmr-history 하위 라우트

export const usersRouter = Router();

usersRouter.get("/me", authMiddleware, usersController.getMe);
usersRouter.patch("/me", authMiddleware, validate(updateMeSchema), usersController.updateMe);
usersRouter.get("/:id", authMiddleware, usersController.getUser);

// API 명세서: POST /users/me/profile-image
usersRouter.post(
  "/me/profile-image",
  authMiddleware,
  profileImageUpload,
  usersController.updateProfileImage,
);

// API 명세서: POST/GET /users/me/game-accounts, DELETE /users/me/game-accounts/:id
usersRouter.use("/me/game-accounts", authMiddleware, meGameAccountsRouter);

// API 명세서: GET /users/me/mmr-history
usersRouter.use("/me/mmr-history", authMiddleware, myMmrHistoryRouter);

export default usersRouter;
