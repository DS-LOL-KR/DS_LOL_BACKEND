import type { CreateGameAccountInput } from "./game-accounts.schema"; // POST /users/me/game-accounts 요청 바디의 형태를 명시하기 위해 사용

// 기능명세서: "게임 종목 선택" — 어떤 게임으로 내전할지 선택할 때 쓰는 목록
// API 명세서: GET /games
export async function listGames(): Promise<unknown[]> {
  throw new Error("Not implemented");
}

// API 명세서: POST /users/me/game-accounts
// TODO: gameNickname(#태그 포함)으로 라이엇 Account-V1 등을 조회해서 puuid를
// 확보한 뒤 game_accounts 행 생성. 생성 시 user_game_stats 기본행도 함께
// 만들어야 하는지 확인 필요(현재 ERD상 자동 생성 규칙이 명시돼 있지 않음).
export async function createGameAccount(
  userId: number,
  input: CreateGameAccountInput,
): Promise<unknown> {
  throw new Error("Not implemented");
}

// API 명세서: GET /users/me/game-accounts
export async function listMyGameAccounts(userId: number): Promise<unknown[]> {
  throw new Error("Not implemented");
}

// API 명세서: DELETE /users/me/game-accounts/:id
export async function deleteGameAccount(userId: number, gameAccountId: number): Promise<void> {
  throw new Error("Not implemented");
}

// 기능명세서: "전적 자동 갱신" — "사용자가 직접 갱신할 수 있게 버튼 하나 만들 계획"
// API 명세서: POST /game-accounts/:id/refresh
// TODO: 라이엇 API에서 최신 전적/티어를 가져와 user_game_stats,
// user_position_stats를 갱신. src/jobs 쪽 스케줄러(자동 갱신)와 로직 공유 검토.
export async function refreshGameAccountStats(gameAccountId: number): Promise<unknown> {
  throw new Error("Not implemented");
}

// API 명세서: GET /game-accounts/:id/stats
export async function getGameAccountStats(gameAccountId: number): Promise<unknown> {
  throw new Error("Not implemented");
}
