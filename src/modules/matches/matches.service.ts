import { prisma } from "../../config/prisma"; // custom_matches, custom_match_participants 등 테이블 접근
import { AppError } from "../../lib/AppError"; // 400/403/404/409 등 의도된 에러를 명확하게 표현하기 위해 사용
import { balanceTeams, type TeamBalancerParticipant } from "../../lib/teamBalancer"; // 실제 팀 배정 알고리즘
// 아래 각 요청의 바디 형태를 명시하기 위해 사용 (평가 생성 / 내전 생성 / 내전 종료 /
// 팀 자동 구성 / 팀 수동 조정)
import type {
  CreateEvaluationInput,
  CreateMatchInput,
  FinishMatchInput,
  GenerateTeamsInput,
  UpdateTeamsInput,
} from "./matches.schema";

async function findGroupOrThrow(groupId: number) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) {
    throw new AppError(404, "그룹을 찾을 수 없습니다.");
  }
  return group;
}

async function findMatchOrThrow(matchId: number) {
  const match = await prisma.customMatch.findUnique({
    where: { id: matchId },
    include: { participants: true },
  });
  if (!match) {
    throw new AppError(404, "내전을 찾을 수 없습니다.");
  }
  return match;
}

// 내전 참가자로 등록하려는 유저가 실제로 그 그룹의 멤버인지 확인.
async function assertGroupMembers(groupId: number, userIds: number[]): Promise<void> {
  const members = await prisma.groupMember.findMany({
    where: { groupId, userId: { in: userIds } },
    select: { userId: true },
  });
  const memberIds = new Set(members.map((m) => m.userId));
  const notMembers = userIds.filter((id) => !memberIds.has(id));
  if (notMembers.length > 0) {
    throw new AppError(400, `그룹 멤버가 아닌 유저가 포함되어 있습니다: ${notMembers.join(", ")}`);
  }
}

// 내전 생성 자체 (그룹 안에서 진행할 새 custom_matches 행 생성)
// API 명세서: POST /groups/:id/matches
export async function createMatch(groupId: number, createdBy: number, _input: CreateMatchInput) {
  const group = await findGroupOrThrow(groupId);
  await assertGroupMembers(groupId, [createdBy]);

  return prisma.customMatch.create({
    data: { groupId, gameId: group.gameId, createdBy },
  });
}

// API 명세서: GET /groups/:id/matches
// 기능명세서: "내전 기록 조회" — "내전에서 이겼는지 졌는지 확인 가능"
export async function listMatchesForGroup(groupId: number) {
  await findGroupOrThrow(groupId);

  return prisma.customMatch.findMany({
    where: { groupId },
    orderBy: { createdAt: "desc" },
    include: { participants: true },
  });
}

// API 명세서: GET /matches/:id
export async function getMatchById(matchId: number) {
  return findMatchOrThrow(matchId);
}

// 그룹의 게임 종목 기준으로 이 유저의 mmr/선호 포지션을 조회.
// 연결된 계정이 없으면 기본값(mmr 1000, 포지션 없음)으로 취급.
// mmr은 "라인별 MMR"(user_position_stats.position_mmr)을 우선 사용 — 선호 라인이
// 없으면(매치 동기화 이력 없음) 계정 전체 internal_mmr로 대체함. position_mmr은
// game-accounts.service.ts의 recomputePositionStats()에서 계산됨(2026-08-25 도입).
async function resolveParticipantStats(userId: number, gameId: number): Promise<TeamBalancerParticipant> {
  const gameAccount = await prisma.gameAccount.findUnique({
    where: { userId_gameId: { userId, gameId } },
    include: { stats: true, positionStats: true },
  });

  if (!gameAccount) {
    return { userId, mmr: 1000, preferredPosition: null };
  }

  const topPosition = [...gameAccount.positionStats].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0];

  return {
    userId,
    mmr: topPosition?.positionMmr ?? gameAccount.stats?.internalMmr ?? 1000,
    preferredPosition: topPosition?.position ?? null,
  };
}

// 기능명세서: "팀 구성" — "티어별 비슷한 사람끼리 팀을 구성함, AI가 라인도 고려해서 팀을 짜줌"
// API 명세서: POST /matches/:id/teams/generate
// FINISHED된 내전은 재구성 불가. WAITING/MATCHED 상태면 (재추첨 포함) 허용 —
// 기존 참가자 배정을 지우고 새로 계산해서 덮어씀.
export async function generateTeams(matchId: number, input: GenerateTeamsInput) {
  const match = await findMatchOrThrow(matchId);
  if (match.status === "FINISHED") {
    throw new AppError(409, "이미 종료된 내전은 팀을 다시 구성할 수 없습니다.");
  }

  await assertGroupMembers(match.groupId, input.participantUserIds);

  const participantStats = await Promise.all(
    input.participantUserIds.map((userId) => resolveParticipantStats(userId, match.gameId)),
  );
  const assignments = balanceTeams(participantStats);

  await prisma.$transaction([
    prisma.customMatchParticipant.deleteMany({ where: { matchId } }),
    ...assignments.map((assignment) =>
      prisma.customMatchParticipant.create({
        data: {
          matchId,
          userId: assignment.userId,
          assignedTeam: assignment.assignedTeam,
          assignedPosition: assignment.assignedPosition,
        },
      }),
    ),
    prisma.customMatch.update({ where: { id: matchId }, data: { status: "MATCHED" } }),
  ]);

  return findMatchOrThrow(matchId);
}

// 기능명세서: "팀 구성 재추첨/수동 조정" — "팀이 맘에 안 들면 변경 가능"
// API 명세서: PATCH /matches/:id/teams
// 이미 참가자로 등록된 유저의 배정만 바꿀 수 있음 — 새 참가자를 추가하려면
// teams/generate로 다시 구성해야 함.
export async function updateTeams(matchId: number, input: UpdateTeamsInput) {
  const match = await findMatchOrThrow(matchId);
  if (match.status === "FINISHED") {
    throw new AppError(409, "이미 종료된 내전의 팀은 조정할 수 없습니다.");
  }

  const participantUserIds = new Set(match.participants.map((p) => p.userId));
  const unknownUserIds = input.assignments
    .map((a) => a.userId)
    .filter((userId) => !participantUserIds.has(userId));
  if (unknownUserIds.length > 0) {
    throw new AppError(
      400,
      `이 내전의 참가자가 아닌 유저입니다: ${unknownUserIds.join(", ")}`,
    );
  }

  await prisma.$transaction(
    input.assignments.map((assignment) =>
      prisma.customMatchParticipant.update({
        where: { matchId_userId: { matchId, userId: assignment.userId } },
        data: {
          assignedTeam: assignment.assignedTeam,
          assignedPosition: assignment.assignedPosition,
        },
      }),
    ),
  );

  return findMatchOrThrow(matchId);
}

// 라이엇이 정식 랭크 점수(LP)를 안 주는 것처럼 우리도 별도 랭크 점수가 없어서,
// 간단한 Elo 방식으로 승패에 따른 mmr 변동폭을 계산함. 팀 평균 mmr 차이가 클수록
// (이변일수록) 변동폭이 커짐 — K=32는 체스 Elo에서 흔히 쓰는 값을 그대로 사용.
const ELO_K_FACTOR = 32;

function calculateMmrChange(ownTeamAvgMmr: number, opponentTeamAvgMmr: number, won: boolean): number {
  const expectedScore = 1 / (1 + 10 ** ((opponentTeamAvgMmr - ownTeamAvgMmr) / 400));
  const actualScore = won ? 1 : 0;
  return Math.round(ELO_K_FACTOR * (actualScore - expectedScore));
}

// API 명세서: POST /matches/:id/finish
// status를 FINISHED로, winning_team을 기록. 이 시점에 참가자별 mmr 변동을 계산해서
// custom_match_participants.mmr_change와 user_game_stats.internal_mmr에 반영함.
export async function finishMatch(matchId: number, input: FinishMatchInput) {
  const match = await findMatchOrThrow(matchId);
  if (match.status !== "MATCHED") {
    throw new AppError(409, "팀이 구성된(MATCHED) 내전만 종료할 수 있습니다.");
  }

  const teamAParticipants = match.participants.filter((p) => p.assignedTeam === "TEAM_A");
  const teamBParticipants = match.participants.filter((p) => p.assignedTeam === "TEAM_B");

  const gameAccountByUserId = new Map<
    number,
    { id: number; internalMmr: number } | null
  >();
  await Promise.all(
    match.participants.map(async (p) => {
      const gameAccount = await prisma.gameAccount.findUnique({
        where: { userId_gameId: { userId: p.userId, gameId: match.gameId } },
        include: { stats: true },
      });
      gameAccountByUserId.set(
        p.userId,
        gameAccount ? { id: gameAccount.id, internalMmr: gameAccount.stats?.internalMmr ?? 1000 } : null,
      );
    }),
  );

  const averageMmr = (participants: typeof match.participants): number => {
    if (participants.length === 0) return 1000;
    const sum = participants.reduce(
      (acc, p) => acc + (gameAccountByUserId.get(p.userId)?.internalMmr ?? 1000),
      0,
    );
    return sum / participants.length;
  };

  const avgA = averageMmr(teamAParticipants);
  const avgB = averageMmr(teamBParticipants);

  await Promise.all(
    match.participants.map(async (p) => {
      const isTeamA = p.assignedTeam === "TEAM_A";
      const ownAvg = isTeamA ? avgA : avgB;
      const opponentAvg = isTeamA ? avgB : avgA;
      const won =
        (isTeamA && input.winningTeam === "TEAM_A") || (!isTeamA && input.winningTeam === "TEAM_B");
      const mmrChange = calculateMmrChange(ownAvg, opponentAvg, won);

      await prisma.customMatchParticipant.update({
        where: { id: p.id },
        data: { mmrChange },
      });

      const gameAccount = gameAccountByUserId.get(p.userId);
      if (gameAccount) {
        await prisma.userGameStat.upsert({
          where: { gameAccountId: gameAccount.id },
          update: { internalMmr: { increment: mmrChange } },
          create: { gameAccountId: gameAccount.id, internalMmr: 1000 + mmrChange },
        });
      }
    }),
  );

  return prisma.customMatch.update({
    where: { id: matchId },
    data: { status: "FINISHED", winningTeam: input.winningTeam },
    include: { participants: true },
  });
}

// 대상 유저가 이 게임(gameId)에서 받은 모든 평가의 평균을 user_game_stats.manner_score에 반영.
async function recomputeMannerScore(targetUserId: number, gameId: number): Promise<void> {
  const evaluations = await prisma.userEvaluation.findMany({
    where: { targetId: targetUserId, match: { gameId } },
    select: { score: true },
  });
  if (evaluations.length === 0) return;

  const average = evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length;

  const gameAccount = await prisma.gameAccount.findUnique({
    where: { userId_gameId: { userId: targetUserId, gameId } },
  });
  if (!gameAccount) return;

  await prisma.userGameStat.upsert({
    where: { gameAccountId: gameAccount.id },
    update: { mannerScore: average },
    create: { gameAccountId: gameAccount.id, mannerScore: average },
  });
}

// 기능명세서: "사용자 평가" — "내전이 끝나면 사용자 평가를 받음 (전적을 불러와서)"
// API 명세서: POST /matches/:id/evaluations
export async function createEvaluation(
  matchId: number,
  evaluatorId: number,
  input: CreateEvaluationInput,
) {
  const match = await findMatchOrThrow(matchId);
  if (match.status !== "FINISHED") {
    throw new AppError(409, "종료된 내전에서만 평가를 남길 수 있습니다.");
  }
  if (evaluatorId === input.targetId) {
    throw new AppError(400, "본인을 평가할 수 없습니다.");
  }

  const participantUserIds = new Set(match.participants.map((p) => p.userId));
  if (!participantUserIds.has(evaluatorId) || !participantUserIds.has(input.targetId)) {
    throw new AppError(400, "이 내전의 참가자만 서로 평가할 수 있습니다.");
  }

  try {
    const evaluation = await prisma.userEvaluation.create({
      data: {
        matchId,
        evaluatorId,
        targetId: input.targetId,
        score: input.score,
        comment: input.comment,
      },
    });

    await recomputeMannerScore(input.targetId, match.gameId);

    return evaluation;
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      throw new AppError(409, "이 내전에서 이미 이 유저를 평가했습니다.");
    }
    throw err;
  }
}

// 기능명세서: "MMR 변동 내역 확인" — "내 점수가 왜 올랐는지/내렸는지 확인 가능"
// API 명세서: GET /matches/:id/mmr-changes
export async function getMmrChangesForMatch(matchId: number) {
  const match = await findMatchOrThrow(matchId);

  return match.participants.map((p) => ({
    userId: p.userId,
    assignedTeam: p.assignedTeam,
    mmrChange: p.mmrChange,
  }));
}

// API 명세서: GET /users/me/mmr-history
export async function getMyMmrHistory(userId: number) {
  const participations = await prisma.customMatchParticipant.findMany({
    where: { userId, match: { status: "FINISHED" } },
    include: { match: true },
    orderBy: { match: { createdAt: "desc" } },
  });

  return participations.map((p) => ({
    matchId: p.matchId,
    groupId: p.match.groupId,
    mmrChange: p.mmrChange,
    playedAt: p.match.createdAt,
  }));
}
