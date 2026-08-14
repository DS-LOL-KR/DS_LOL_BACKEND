import { z } from "zod"; // 요청 쿼리/바디 검증 스키마를 정의하기 위해 사용

// API 명세서: GET /auth/google/callback (설정 카테고리)
// 구글 OAuth 콜백은 쿼리스트링(code, state 등)으로 전달됨 — 기존 validate() 미들웨어는
// req.body만 검사하므로, 쿼리 검증용 별도 헬퍼가 필요할 수 있음. 구현 시 확인.
export const googleCallbackQuerySchema = z.object({
  code: z.string().min(1),
});

export type GoogleCallbackQuery = z.infer<typeof googleCallbackQuerySchema>;
