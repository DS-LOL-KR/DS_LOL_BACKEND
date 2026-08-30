import { prisma } from "../../config/prisma"; // custom_matches, custom_match_participants 등 테이블 접근
import { AppError } from "../../lib/AppError"; // 400/403/404/409 등 의도된 에러를 명확하게 표현하기 위해 사용
import { balanceTeams, type TeamBalancerParticipant } from "../../lib/teamBalancer"; // 실제 팀 배정 알고리즘
import { recalculateInternalMmr } from "../../lib/mmr"; // 매너점수가 바뀔 때 internal_mmr에도 반영하기 위해 사용
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
  return buildMatchDetail(await findMatchOrThrow(matchId));
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

// 라이엇이 정식 랭크 점수(LP)를 안 주는 것처럼 우리도 별도 랭크 점수가 없어서,
// 간단한 Elo 방식으로 기대 승률/mmr 변동폭을 계산함. 팀 평균 mmr 차이가 클수록
// 기대 승률이 한쪽으로 쏠림.
function calculateExpectedWinRate(ownAvgMmr: number, opponentAvgMmr: number): number {
  return 1 / (1 + 10 ** ((opponentAvgMmr - ownAvgMmr) / 400));
}

type MatchParticipantRow = {
  id: number;
  matchId: number;
  userId: number;
  assignedTeam: string | null;
  assignedPosition: string | null;
  mmrChange: number;
};

interface ParticipantDetail {
  id: number;
  matchId: number;
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
  assignedTeam: "TEAM_A" | "TEAM_B" | null;
  assignedPosition: string | null;
  mmrChange: number;
  tier: string | null;
  mmr: number;
  hasLinkedAccount: boolean;
  preferredPosition: string | null;
}

// GET /matches/:id, teams/generate, teams(PATCH), finish 응답에 프론트가 바로 쓸 수
// 있는 닉네임/티어/MMR을 붙임 — 지금까지 이 값들이 응답에 전혀 없어서 프론트가
// mock으로 채워야 했던 부분.
async function buildParticipantDetail(
  participant: MatchParticipantRow,
  gameId: number,
): Promise<ParticipantDetail> {
  const [user, gameAccount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: participant.userId },
      select: { nickname: true, profileImageUrl: true },
    }),
    prisma.gameAccount.findUnique({
      where: { userId_gameId: { userId: participant.userId, gameId } },
      include: { stats: true, positionStats: true },
    }),
  ]);

  const topPosition = gameAccount
    ? [...gameAccount.positionStats].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0]
    : undefined;
  const assignedPositionStat = gameAccount?.positionStats.find(
    (p) => p.position === participant.assignedPosition,
  );

  // 실제로 배정된 라인의 MMR을 우선 쓰고, 그 라인 기록이 없으면 가장 많이 한
  // 라인 MMR, 그것도 없으면 전체 internal_mmr로 폴백.
  const mmr =
    assignedPositionStat?.positionMmr ?? topPosition?.positionMmr ?? gameAccount?.stats?.internalMmr ?? 1000;

  return {
    id: participant.id,
    matchId: participant.matchId,
    userId: participant.userId,
    nickname: user?.nickname ?? "알 수 없음",
    profileImageUrl: user?.profileImageUrl ?? null,
    assignedTeam: participant.assignedTeam as "TEAM_A" | "TEAM_B" | null,
    assignedPosition: participant.assignedPosition,
    mmrChange: participant.mmrChange,
    tier: gameAccount?.stats?.officialTier ?? null,
    mmr,
    hasLinkedAccount: gameAccount !== null,
    preferredPosition: topPosition?.position ?? null,
  };
}

interface TeamSummary {
  totalMmr: number;
  averageMmr: number;
  expectedWinRate: number;
}

interface TeamAnalysis {
  teamA: TeamSummary;
  teamB: TeamSummary;
  balancePercent: number;
  reasoning: string[];
}

// 팀 밸런스%/예상 승률/구성 근거 — 새 컬럼을 저장하는 게 아니라, 지금 배정 상태를
// 그때그때 분석해서 만듦. 그래서 PATCH로 수동 조정해도 다음 조회 때 항상 현재
// 상태 기준으로 다시 계산되고, teams/generate 당시 로그랑 어긋날 일이 없음.
function buildTeamAnalysis(participants: ParticipantDetail[]): TeamAnalysis | null {
  const teamA = participants.filter((p) => p.assignedTeam === "TEAM_A");
  const teamB = participants.filter((p) => p.assignedTeam === "TEAM_B");

  if (teamA.length === 0 || teamB.length === 0) {
    return null; // 아직 팀이 안 나뉜 상태(WAITING)면 분석할 게 없음
  }

  const sumMmr = (list: ParticipantDetail[]) => list.reduce((acc, p) => acc + p.mmr, 0);
  const totalA = sumMmr(teamA);
  const totalB = sumMmr(teamB);
  const avgA = totalA / teamA.length;
  const avgB = totalB / teamB.length;
  const balancePercent =
    Math.round((Math.min(totalA, totalB) / Math.max(totalA, totalB)) * 1000) / 10;

  const reasoning: string[] = [
    `TEAM_A 합계 ${totalA} vs TEAM_B 합계 ${totalB} (차이 ${Math.abs(totalA - totalB)}, 밸런스 ${balancePercent}%)`,
  ];

  for (const [teamName, team] of [
    ["TEAM_A", teamA],
    ["TEAM_B", teamB],
  ] as const) {
    const positionCounts = new Map<string, number>();
    for (const p of team) {
      if (!p.assignedPosition) continue;
      positionCounts.set(p.assignedPosition, (positionCounts.get(p.assignedPosition) ?? 0) + 1);
    }
    for (const [position, count] of positionCounts) {
      if (count > 1) {
        reasoning.push(`${teamName}에 ${position} 포지션이 ${count}명 있습니다 (라인 중복).`);
      }
    }
  }

  for (const p of participants) {
    if (!p.hasLinkedAccount) {
      reasoning.push(`${p.nickname}님은 연동된 게임 계정이 없어 기본 MMR(1000)로 계산됐습니다.`);
    } else if (p.preferredPosition && p.assignedPosition && p.preferredPosition !== p.assignedPosition) {
      reasoning.push(
        `${p.nickname}님은 주로 하는 라인(${p.preferredPosition})이 아닌 ${p.assignedPosition}로 배정됐습니다.`,
      );
    }
  }

  return {
    teamA: {
      totalMmr: totalA,
      averageMmr: Math.round(avgA),
      expectedWinRate: Math.round(calculateExpectedWinRate(avgA, avgB) * 1000) / 1000,
    },
    teamB: {
      totalMmr: totalB,
      averageMmr: Math.round(avgB),
      expectedWinRate: Math.round(calculateExpectedWinRate(avgB, avgA) * 1000) / 1000,
    },
    balancePercent,
    reasoning,
  };
}

async function buildMatchDetail(match: Awaited<ReturnType<typeof findMatchOrThrow>>) {
  const participants = await Promise.all(
    match.participants.map((p) => buildParticipantDetail(p, match.gameId)),
  );

  return {
    ...match,
    participants,
    teamAnalysis: buildTeamAnalysis(participants),
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

  return buildMatchDetail(await findMatchOrThrow(matchId));
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

  return buildMatchDetail(await findMatchOrThrow(matchId));
}

// 이변일수록(팀 평균 mmr 차이가 클수록) 변동폭이 커짐 — K=32는 체스 Elo에서
// 흔히 쓰는 값을 그대로 사용. 기대 승률 자체는 calculateExpectedWinRate() 재사용.
const ELO_K_FACTOR = 32;

function calculateMmrChange(ownTeamAvgMmr: number, opponentTeamAvgMmr: number, won: boolean): number {
  const expectedScore = calculateExpectedWinRate(ownTeamAvgMmr, opponentTeamAvgMmr);
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

  const finishedMatch = await prisma.customMatch.update({
    where: { id: matchId },
    data: { status: "FINISHED", winningTeam: input.winningTeam },
    include: { participants: true },
  });

  return buildMatchDetail(finishedMatch);
}

// API 명세서: POST /matches/:id/duplicate-teams ("이 팀 그대로 다음 판 만들기")
// 매번 끝날 때마다 자동으로 다음 판을 만드는 대신(2026-08-30에 시도했다가, 자동
// 으로 계속 이어지는 것보다 필요할 때만 누르는 버튼을 원하셔서 되돌림), 사용자가
// 직접 눌렀을 때만 같은 그룹·같은 팀 배정으로 새 내전을 MATCHED 상태로 하나 더 만듦.
export async function duplicateMatchTeams(matchId: number) {
  const match = await findMatchOrThrow(matchId);

  const nextMatch = await prisma.customMatch.create({
    data: {
      groupId: match.groupId,
      gameId: match.gameId,
      createdBy: match.createdBy,
      status: "MATCHED",
    },
  });

  await prisma.customMatchParticipant.createMany({
    data: match.participants.map((p) => ({
      matchId: nextMatch.id,
      userId: p.userId,
      assignedTeam: p.assignedTeam,
      assignedPosition: p.assignedPosition,
    })),
  });

  return getMatchById(nextMatch.id);
}

// 대상 유저가 이 게임(gameId)에서 받은 모든 평가의 평균을 user_game_stats.manner_score에 반영.
// internal_mmr도 여기서 같이 반영함(2026-08-28) — recalculateInternalMmr은 매너점수가
// 실제로 바뀔 때 딱 한 번만 적용돼야 하는데, 예전엔 game-accounts.service.ts(지금 갱신)나
// tiers.service.ts(티어 재선정)를 누를 때마다 매번 다시 섞여 들어가서 아무것도 안
// 바뀌었는데도 internal_mmr이 계속 움직이는 버그가 있었음. 매너점수가 바뀌는 유일한
// 지점인 여기서만 반영하도록 정리.
async function recomputeMannerScore(targetUserId: number, gameId: number): Promise<void> {
  const evaluations = await prisma.userEvaluation.findMany({
    where: { targetId: targetUserId, match: { gameId } },
    select: { score: true },
  });
  if (evaluations.length === 0) return;

  const average = evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length;

  const gameAccount = await prisma.gameAccount.findUnique({
    where: { userId_gameId: { userId: targetUserId, gameId } },
    include: { stats: true },
  });
  if (!gameAccount) return;

  const internalMmr = recalculateInternalMmr(
    gameAccount.stats?.officialTier ?? null,
    gameAccount.stats?.internalMmr ?? 1000,
    average,
  );

  await prisma.userGameStat.upsert({
    where: { gameAccountId: gameAccount.id },
    update: { mannerScore: average, internalMmr },
    create: { gameAccountId: gameAccount.id, mannerScore: average, internalMmr },
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

// API 명세서: DELETE /matches/:id
// 내전을 만든 사람이나 그룹장만 삭제 가능(요청한 유저는 컨트롤러에서 넘겨받음).
// FINISHED된 내전이었으면 그때 참가자별로 반영해둔 mmr_change를 되돌려서, 내전
// 기록은 지워졌는데 그 내전으로 오르내린 internal_mmr만 그대로 남는 상황을 막음.
// (매너평가로 반영된 internal_mmr 변화까지는 되돌리지 않음 — mmrChange와 달리
// "이 평가 하나가 얼마나 반영됐는지"를 따로 저장해두지 않아서 정확히 역산 불가.)
export async function deleteMatch(matchId: number, userId: number): Promise<void> {
  const match = await findMatchOrThrow(matchId);
  const group = await findGroupOrThrow(match.groupId);

  if (match.createdBy !== userId && group.ownerId !== userId) {
    throw new AppError(403, "이 내전을 만든 사람이나 그룹장만 삭제할 수 있습니다.");
  }

  if (match.status === "FINISHED") {
    await Promise.all(
      match.participants.map(async (p) => {
        if (p.mmrChange === 0) return;
        const gameAccount = await prisma.gameAccount.findUnique({
          where: { userId_gameId: { userId: p.userId, gameId: match.gameId } },
        });
        if (!gameAccount) return;
        await prisma.userGameStat.updateMany({
          where: { gameAccountId: gameAccount.id },
          data: { internalMmr: { decrement: p.mmrChange } },
        });
      }),
    );
  }

  await prisma.$transaction([
    prisma.userEvaluation.deleteMany({ where: { matchId } }),
    prisma.customMatchParticipant.deleteMany({ where: { matchId } }),
    prisma.customMatch.delete({ where: { id: matchId } }),
  ]);
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
