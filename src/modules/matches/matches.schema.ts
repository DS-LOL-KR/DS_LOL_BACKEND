import { z } from "zod"; // 요청 바디 검증 스키마를 정의하기 위해 사용

// 기능명세서: "게임 종목 선택"에 따라 그룹의 게임이 이미 정해져 있으므로, 내전 생성
// 자체는 별도 입력이 거의 없을 수 있음 — 상세 명세 없어 빈 스키마로 둠. 구현 시 확인.
// API 명세서: POST /groups/:id/matches
export const createMatchSchema = z.object({});

export type CreateMatchInput = z.infer<typeof createMatchSchema>;

// 기능명세서: "팀 구성" — "티어별 비슷한 사람끼리 팀을 구성함, AI가 라인도 고려해서 팀을 짜줌"
// API 명세서: POST /matches/:id/teams/generate
// 이 엔드포인트는 5v5(10명)뿐 아니라 프론트 MatchCreatePage의 3v3(6명)/커스텀(2명+)
// 모드도 그대로 공유해서 씀 — "몇 명이어야 하는지"는 서버에 저장되지 않는 프론트
// 전용 선택값이라, 여기서 특정 인원수를 강제하면 3v3/커스텀이 깨짐. 인원수 강제는
// MatchCreatePage.tsx가 모드별로 이미 하고 있고(2026-09-13 확인), 여기는 팀을 나눌
// 수 있는 최소 인원(2명)만 방어적으로 막음.
export const generateTeamsSchema = z.object({
  participantUserIds: z.array(z.number().int().positive()).min(2),
});

export type GenerateTeamsInput = z.infer<typeof generateTeamsSchema>;

// 기능명세서: "팀 구성 재추첨/수동 조정" — "팀이 맘에 안 들면 변경 가능"
// API 명세서: PATCH /matches/:id/teams
export const updateTeamsSchema = z.object({
  assignments: z.array(
    z.object({
      userId: z.number().int().positive(),
      assignedTeam: z.enum(["TEAM_A", "TEAM_B"]),
      assignedPosition: z.enum(["TOP", "JUG", "MID", "ADC", "SUP"]).optional(),
    }),
  ),
});

export type UpdateTeamsInput = z.infer<typeof updateTeamsSchema>;

// API 명세서: POST /matches/:id/finish
// 기능명세서: "내전 기록 조회" — "내전에서 이겼는지 졌는지 확인 가능"의 전제가 되는 종료 처리
export const finishMatchSchema = z.object({
  winningTeam: z.enum(["TEAM_A", "TEAM_B"]),
});

export type FinishMatchInput = z.infer<typeof finishMatchSchema>;

// 기능명세서: "사용자 평가" — "내전이 끝나면 사용자 평가를 받음"
// API 명세서: POST /matches/:id/evaluations
export const createEvaluationSchema = z.object({
  targetId: z.number().int().positive(),
  score: z.number().int().min(1).max(5), // ERD: user_evaluations.score (1~5)
  comment: z.string().max(500).optional(),
});

export type CreateEvaluationInput = z.infer<typeof createEvaluationSchema>;

// API 명세서: GET /users/me/mmr-history
// groupId 없이는 유저가 속한 모든 그룹의 MMR 변동이 뒤섞여서 나왔던 버그 수정용
// (2026-09-13) — 특정 그룹 화면에서 보여줄 땐 그 그룹의 내전만 필터링되게 함.
// 안 주면(그룹 무관하게 전체 보고 싶을 때 등) 기존처럼 전체를 반환.
export const myMmrHistoryQuerySchema = z.object({
  groupId: z.coerce.number().int().positive().optional(),
});

export type MyMmrHistoryQuery = z.infer<typeof myMmrHistoryQuerySchema>;
