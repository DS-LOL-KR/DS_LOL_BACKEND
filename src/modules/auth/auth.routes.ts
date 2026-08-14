import { Router } from "express"; // 이 모듈만의 하위 라우터를 만들기 위해 사용
import * as authController from "./auth.controller"; // 각 라우트에 연결할 요청 핸들러

// 명세서: API 명세서 > 설정
export const authRouter = Router();

authRouter.get("/google", authController.googleAuth);
authRouter.get("/google/callback", authController.googleCallback);
authRouter.post("/logout", authController.logout);

export default authRouter;
