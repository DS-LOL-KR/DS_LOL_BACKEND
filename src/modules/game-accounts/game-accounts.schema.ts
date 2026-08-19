import { z } from "zod"; // 요청 바디 검증 스키마를 정의하기 위해 사용

// 기능명세서: 게임 계정을 연결할 때 라이엇 아이디(닉네임#태그)를 입력
// API 명세서: POST /users/me/game-accounts
// gameName/tagLine을 따로 받는 이유: 라이엇 Account-V1 API가 이 둘을 별개 경로
// 파라미터로 받음. 저장할 땐 서비스에서 "gameName#tagLine" 형태로 합쳐서
// ERD의 game_accounts.game_nickname 한 컬럼에 넣음.
export const createGameAccountSchema = z.object({
  gameId: z.number().int().positive(),
  gameName: z.string().min(1), // 라이엇 아이디의 '#' 앞부분
  tagLine: z.string().min(1), // '#' 뒷부분 (예: KR1)
});

export type CreateGameAccountInput = z.infer<typeof createGameAccountSchema>;

// API 명세서: POST /game-accounts/:id/match-history/sync
export const syncMatchHistorySchema = z.object({
  // 라이엇 API 한 번 호출당 매치 ID를 최대 100개까지만 조회 가능
  count: z.number().int().min(1).max(100).default(20),
});

export type SyncMatchHistoryInput = z.infer<typeof syncMatchHistorySchema>;

// API 명세서: GET /game-accounts/:id/match-history
// query string은 항상 문자열로 오므로 z.coerce로 숫자 변환
export const listMatchHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  position: z.enum(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]).optional(),
});

export type ListMatchHistoryQuery = z.infer<typeof listMatchHistoryQuerySchema>;

// API 명세서: GET /game-accounts/:id/champion-masteries
export const listChampionMasteriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type ListChampionMasteriesQuery = z.infer<typeof listChampionMasteriesQuerySchema>;
