import { z } from "zod"; // 쿼리 파라미터 검증 스키마를 정의하기 위해 사용

// API 명세서: GET /groups/:id/tiers?position=MID (기능명세서 "라인별 티어선정")
export const listTiersQuerySchema = z.object({
  position: z.enum(["TOP", "JUG", "MID", "ADC", "SUP"]).optional(),
});

export type ListTiersQuery = z.infer<typeof listTiersQuerySchema>;
