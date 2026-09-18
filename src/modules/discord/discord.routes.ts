import { Router } from "express"; // 이 모듈만의 라우터를 만들기 위해 사용
import { handleInteraction } from "./discord.controller"; // 실제 인터랙션 처리 핸들러

// app.ts에서 /api/discord로 마운트. authMiddleware를 안 씀 — 디스코드가 우리
// 서비스 유저를 대신해서 호출하는 게 아니라 디스코드 자체가 직접 호출하는
// 엔드포인트라, 컨트롤러 안에서 Ed25519 서명으로 "진짜 디스코드가 보낸 요청인지"를
// 대신 검증함(디스코드 공식 요구사항).
export const discordRouter = Router();

discordRouter.post("/interactions", handleInteraction);

export default discordRouter;
