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

// API 명세서: PATCH /game-accounts/:id/preferred-position
// 내부 라인 약어(TOP/JUG/MID/ADC/SUP) — 라이엇 원본 값(TOP/JUNGLE/...)이 아니라
// teamBalancer.ts/assignedPosition 등 내전 팀 배정 쪽에서 이미 쓰는 값과 맞춤.
// null을 명시적으로 보내면 "직접 지정 해제 → 자동 추론으로 되돌리기"로 처리함.
const POSITION_ENUM = z.enum(["TOP", "JUG", "MID", "ADC", "SUP"]);
export const updatePreferredPositionSchema = z
  .object({
    mainPosition: POSITION_ENUM.nullable().optional(),
    subPosition: POSITION_ENUM.nullable().optional(),
  })
  .refine((data) => !data.mainPosition || !data.subPosition || data.mainPosition !== data.subPosition, {
    message: "메인 라인과 서브 라인은 다르게 설정해주세요.",
    path: ["subPosition"],
  });

export type UpdatePreferredPositionInput = z.infer<typeof updatePreferredPositionSchema>;
