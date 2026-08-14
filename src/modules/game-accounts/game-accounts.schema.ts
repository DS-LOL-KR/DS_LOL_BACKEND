import { z } from "zod"; // 요청 바디 검증 스키마를 정의하기 위해 사용

// 기능명세서: 게임 계정을 연결할 때 라이엇 등 게임 닉네임#태그를 입력
// API 명세서: POST /users/me/game-accounts
export const createGameAccountSchema = z.object({
  gameId: z.number().int().positive(),
  gameNickname: z.string().min(1), // ERD: game_accounts.game_nickname ("게임 내 닉네임#태그")
  // TODO: puuid는 클라이언트가 보내는 값이 아니라, gameNickname으로 라이엇 API를
  // 조회해서 서버가 채워야 하는 값일 가능성이 큼. 구현 시 riot 연동 흐름 확인.
});

export type CreateGameAccountInput = z.infer<typeof createGameAccountSchema>;
