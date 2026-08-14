// 아래 각 요청의 바디 형태를 명시하기 위해 사용 (평가 생성 / 내전 생성 / 내전 종료 /
// 팀 자동 구성 / 팀 수동 조정)
import type {
  CreateEvaluationInput,
  CreateMatchInput,
  FinishMatchInput,
  GenerateTeamsInput,
  UpdateTeamsInput,
} from "./matches.schema";

// 기능명세서: 내전 생성 자체 (그룹 안에서 진행할 새 custom_matches 행 생성)
// API 명세서: POST /groups/:id/matches
export async function createMatch(groupId: number, input: CreateMatchInput): Promise<unknown> {
  throw new Error("Not implemented");
}

// API 명세서: GET /groups/:id/matches
// 기능명세서: "내전 기록 조회" — "내전에서 이겼는지 졌는지 확인 가능"
export async function listMatchesForGroup(groupId: number): Promise<unknown[]> {
  throw new Error("Not implemented");
}

// API 명세서: GET /matches/:id
export async function getMatchById(matchId: number): Promise<unknown> {
  throw new Error("Not implemented");
}

// 기능명세서: "팀 구성" — "티어별 비슷한 사람끼리 팀을 구성함, AI가 라인도 고려해서 팀을 짜줌"
// API 명세서: POST /matches/:id/teams/generate
// TODO: src/lib/teamBalancer.ts의 balanceTeams()를 사용해서 참가자의
// internal_mmr / mainPosition을 기준으로 두 팀을 배정하고, status를
// "MATCHED"로 바꾸며 custom_match_participants 행들을 생성/갱신.
export async function generateTeams(matchId: number, input: GenerateTeamsInput): Promise<unknown> {
  throw new Error("Not implemented");
}

// 기능명세서: "팀 구성 재추첨/수동 조정" — "팀이 맘에 안 들면 변경 가능"
// API 명세서: PATCH /matches/:id/teams
export async function updateTeams(matchId: number, input: UpdateTeamsInput): Promise<unknown> {
  throw new Error("Not implemented");
}

// API 명세서: POST /matches/:id/finish
// TODO: status를 "FINISHED"로, winning_team을 기록. 이 시점에 MMR 변동을
// 계산해서 custom_match_participants.mmr_change / user_game_stats.internal_mmr에
// 반영하는 것까지 같이 처리할지, 별도 트리거로 나눌지 확인 필요.
export async function finishMatch(matchId: number, input: FinishMatchInput): Promise<unknown> {
  throw new Error("Not implemented");
}

// 기능명세서: "사용자 평가" — "내전이 끝나면 사용자 평가를 받음 (전적을 불러와서)"
// API 명세서: POST /matches/:id/evaluations
// TODO: user_evaluations 행 생성 후 target 유저의 user_game_stats.manner_score
// 재계산(평균 등)까지 필요할 수 있음.
export async function createEvaluation(
  matchId: number,
  evaluatorId: number,
  input: CreateEvaluationInput,
): Promise<unknown> {
  throw new Error("Not implemented");
}

// 기능명세서: "MMR 변동 내역 확인" — "내 점수가 왜 올랐는지/내렸는지 확인 가능"
// API 명세서: GET /matches/:id/mmr-changes
export async function getMmrChangesForMatch(matchId: number): Promise<unknown[]> {
  throw new Error("Not implemented");
}

// API 명세서: GET /users/me/mmr-history
// TODO: 유저가 참여한 custom_match_participants.mmr_change 이력을 시간순으로 모음.
export async function getMyMmrHistory(userId: number): Promise<unknown[]> {
  throw new Error("Not implemented");
}
