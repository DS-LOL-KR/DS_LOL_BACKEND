import { z } from "zod"; // 요청 바디 검증 스키마를 정의하기 위해 사용

// 기능명세서: "게임 종목 선택"에 따라 그룹의 게임이 이미 정해져 있으므로, 내전 생성
// 자체는 별도 입력이 거의 없을 수 있음 — 상세 명세 없어 빈 스키마로 둠. 구현 시 확인.
// API 명세서: POST /groups/:id/matches
export const createMatchSchema = z.object({});

export type CreateMatchInput = z.infer<typeof createMatchSchema>;

// 기능명세서: "팀 구성" — "티어별 비슷한 사람끼리 팀을 구성함, AI가 라인도 고려해서 팀을 짜줌"
// API 명세서: POST /matches/:id/teams/generate
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
