import { Prisma } from "@prisma/client"; // 유니크 제약 위반(P2002) 같은 DB 에러 종류를 구분하기 위해 사용
import { prisma } from "../../config/prisma"; // game_accounts, games, user_game_stats 등 테이블 접근
import { AppError } from "../../lib/AppError"; // 404/403/409 등 의도된 에러를 명확하게 표현하기 위해 사용
import {
  fetchChampionMasteriesByPuuid,
  fetchLeagueEntriesByPuuid,
  fetchMatchById,
  fetchMatchIdsByPuuid,
  fetchRiotAccountByRiotId,
  fetchSummonerByPuuid,
  resolveQueueType,
} from "./riot.client"; // 실제 라이엇 API 호출
import type {
  CreateGameAccountInput,
  ListMatchHistoryQuery,
  SyncMatchHistoryInput,
} from "./game-accounts.schema";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 기능명세서: "게임 종목 선택" — 어떤 게임으로 내전할지 선택할 때 쓰는 목록
// API 명세서: GET /games
export async function listGames() {
  return prisma.game.findMany();
}

// API 명세서: POST /users/me/game-accounts
// 흐름: 1) gameName#tagLine으로 라이엇 계정을 조회해서 puuid를 확보
//      2) game_accounts 행 생성 (userId+gameId 조합은 unique라 중복 연결이면 에러)
export async function createGameAccount(userId: number, input: CreateGameAccountInput) {
  const riotAccount = await fetchRiotAccountByRiotId(input.gameName, input.tagLine);

  try {
    return await prisma.gameAccount.create({
      data: {
        userId,
        gameId: input.gameId,
        gameNickname: `${riotAccount.gameName}#${riotAccount.tagLine}`,
        puuid: riotAccount.puuid,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "이미 이 게임에 연결된 계정이 있습니다.");
    }
    throw err;
  }
}

// API 명세서: GET /users/me/game-accounts
export async function listMyGameAccounts(userId: number) {
  return prisma.gameAccount.findMany({
    where: { userId },
    include: { game: true, stats: true },
  });
}

// API 명세서: DELETE /users/me/game-accounts/:id
async function findOwnedGameAccountOrThrow(userId: number, gameAccountId: number) {
  const account = await prisma.gameAccount.findUnique({ where: { id: gameAccountId } });

  if (!account) {
    throw new AppError(404, "연결된 게임 계정을 찾을 수 없습니다.");
  }
  if (account.userId !== userId) {
    throw new AppError(403, "본인이 연결한 계정만 처리할 수 있습니다.");
  }

  return account;
}

export async function deleteGameAccount(userId: number, gameAccountId: number): Promise<void> {
  await findOwnedGameAccountOrThrow(userId, gameAccountId);

  // game_accounts를 참조하는 자식 테이블을 먼저 지우지 않으면 외래키 제약(P2003)에
  // 걸려서 삭제가 실패함. deleteMany는 대상이 0건이어도 에러 없이 통과함.
  // (match_histories 자체는 안 지움 — 다른 계정이 같은 매치를 참조 중일 수 있어서
  // 공유 데이터로 남겨두고, 이 계정의 참여 기록(match_history_participants)만 지움.)
  await prisma.$transaction([
    prisma.matchHistoryParticipant.deleteMany({ where: { gameAccountId } }),
    prisma.championMastery.deleteMany({ where: { gameAccountId } }),
    prisma.userPositionStat.deleteMany({ where: { gameAccountId } }),
    prisma.userGameStat.deleteMany({ where: { gameAccountId } }),
    prisma.gameAccount.delete({ where: { id: gameAccountId } }),
  ]);
}

// 기능명세서: "전적 자동 갱신" — "사용자가 직접 갱신할 수 있게 버튼 하나 만들 계획"
// API 명세서: POST /game-accounts/:id/refresh
// 솔로랭크 티어(League-V4) + 소환사 레벨/아이콘(Summoner-V4) + 챔피언 숙련도
// (Champion-Mastery-V4)까지 한 번에 갱신. internal_mmr, user_position_stats(라인별
// 전적)는 여기서 안 건드림 — 그건 match-history/sync 쪽에서 실제 매치 기록을 기반으로
// 계산함(라이엇이 "라인별 승률"을 직접 안 줌).
export async function refreshGameAccountStats(userId: number, gameAccountId: number) {
  const account = await findOwnedGameAccountOrThrow(userId, gameAccountId);

  const [entries, summoner, masteries] = await Promise.all([
    fetchLeagueEntriesByPuuid(account.puuid),
    fetchSummonerByPuuid(account.puuid),
    fetchChampionMasteriesByPuuid(account.puuid),
  ]);

  const soloQueue = entries.find((entry) => entry.queueType === "RANKED_SOLO_5x5");
  const officialTier = soloQueue ? `${soloQueue.tier} ${soloQueue.rank}` : null;

  const stats = await prisma.userGameStat.upsert({
    where: { gameAccountId },
    update: {
      officialTier,
      summonerLevel: summoner.summonerLevel,
      profileIconId: summoner.profileIconId,
    },
    create: {
      gameAccountId,
      officialTier,
      summonerLevel: summoner.summonerLevel,
      profileIconId: summoner.profileIconId,
    },
  });

  // 챔피언 숙련도는 계정이 플레이한 챔피언 수만큼(많으면 100개 이상) 오는데, 서로
  // 독립적인 행이라 굳이 한 트랜잭션으로 묶지 않고 병렬로 upsert.
  await Promise.all(
    masteries.map((mastery) =>
      prisma.championMastery.upsert({
        where: { gameAccountId_championId: { gameAccountId, championId: mastery.championId } },
        update: {
          masteryLevel: mastery.championLevel,
          masteryPoints: mastery.championPoints,
          lastPlayTime: new Date(mastery.lastPlayTime),
        },
        create: {
          gameAccountId,
          championId: mastery.championId,
          masteryLevel: mastery.championLevel,
          masteryPoints: mastery.championPoints,
          lastPlayTime: new Date(mastery.lastPlayTime),
        },
      }),
    ),
  );

  return stats;
}

// 기능명세서: "라인별 티어선정"의 재료 데이터 — 실제 매치 기록을 라이엇 Match-V5에서
// 가져와 저장하고, user_position_stats(라인별 게임 수/승률)를 다시 계산함.
// API 명세서: POST /game-accounts/:id/match-history/sync
export async function syncMatchHistory(
  userId: number,
  gameAccountId: number,
  input: SyncMatchHistoryInput,
) {
  const account = await findOwnedGameAccountOrThrow(userId, gameAccountId);

  const matchIds = await fetchMatchIdsByPuuid(account.puuid, input.count);

  // 이미 저장된 매치는 다시 상세 조회(Match-V5는 매치당 1번 더 호출해야 함)할
  // 필요가 없어서 걸러냄 — 라이엇 rate limit을 아끼는 핵심 최적화.
  const existing = await prisma.matchHistory.findMany({
    where: { riotMatchId: { in: matchIds } },
    select: { riotMatchId: true },
  });
  const existingIds = new Set(existing.map((m) => m.riotMatchId));
  const newMatchIds = matchIds.filter((id) => !existingIds.has(id));

  let syncedCount = 0;
  for (const matchId of newMatchIds) {
    const match = await fetchMatchById(matchId);
    const participant = match.info.participants.find((p) => p.puuid === account.puuid);

    if (!participant) {
      // puuid로 매치 ID를 가져왔으니 이론상 참가자 목록에 없을 수 없지만 방어적으로 스킵.
      continue;
    }

    const matchRow = await prisma.matchHistory.upsert({
      where: { riotMatchId: match.metadata.matchId },
      update: {},
      create: {
        riotMatchId: match.metadata.matchId,
        gameId: account.gameId,
        queueType: resolveQueueType(match.info.queueId),
        playedAt: new Date(match.info.gameStartTimestamp),
        durationSeconds: match.info.gameDuration,
      },
    });

    await prisma.matchHistoryParticipant.upsert({
      where: { matchId_gameAccountId: { matchId: matchRow.id, gameAccountId } },
      update: {},
      create: {
        matchId: matchRow.id,
        gameAccountId,
        championId: participant.championId,
        position: participant.teamPosition || null,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        cs: participant.totalMinionsKilled + participant.neutralMinionsKilled,
        goldEarned: participant.goldEarned,
        damageDealt: participant.totalDamageDealtToChampions,
        visionScore: participant.visionScore,
        win: participant.win,
      },
    });

    syncedCount += 1;
    // Development Key 기준 초당 20건 제한을 피하기 위한 최소한의 지연.
    await sleep(60);
  }

  const positionStats = await recomputePositionStats(gameAccountId);

  return {
    syncedCount,
    skippedCount: matchIds.length - newMatchIds.length,
    positionStats,
  };
}

// match_history_participants를 포지션별로 묶어서 games_played/win_rate를 다시 계산.
// 지금은 큐 종류(랭크/일반/칼바람) 구분 없이 전부 합산 — 필요하면 나중에 필터 추가.
async function recomputePositionStats(gameAccountId: number) {
  const participants = await prisma.matchHistoryParticipant.findMany({
    where: { gameAccountId, position: { not: null } },
  });

  const grouped = new Map<string, { games: number; wins: number }>();
  for (const p of participants) {
    const key = p.position as string;
    const entry = grouped.get(key) ?? { games: 0, wins: 0 };
    entry.games += 1;
    if (p.win) entry.wins += 1;
    grouped.set(key, entry);
  }

  const results = [];
  for (const [position, { games, wins }] of grouped) {
    const stat = await prisma.userPositionStat.upsert({
      where: { gameAccountId_position: { gameAccountId, position } },
      update: { gamesPlayed: games, winRate: wins / games },
      create: { gameAccountId, position, gamesPlayed: games, winRate: wins / games },
    });
    results.push(stat);
  }

  return results;
}

// API 명세서: GET /game-accounts/:id/match-history
export async function listMatchHistory(gameAccountId: number, query: ListMatchHistoryQuery) {
  const account = await prisma.gameAccount.findUnique({ where: { id: gameAccountId } });
  if (!account) {
    throw new AppError(404, "연결된 게임 계정을 찾을 수 없습니다.");
  }

  const participants = await prisma.matchHistoryParticipant.findMany({
    where: { gameAccountId, position: query.position },
    include: { match: true },
    orderBy: { match: { playedAt: "desc" } },
    take: query.limit,
  });

  return participants.map((p) => ({
    matchId: p.match.riotMatchId,
    queueType: p.match.queueType,
    playedAt: p.match.playedAt,
    durationSeconds: p.match.durationSeconds,
    championId: p.championId,
    position: p.position,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    cs: p.cs,
    goldEarned: p.goldEarned,
    damageDealt: p.damageDealt,
    visionScore: p.visionScore,
    win: p.win,
  }));
}

// API 명세서: GET /game-accounts/:id/champion-masteries
export async function listChampionMasteries(gameAccountId: number, limit: number) {
  const account = await prisma.gameAccount.findUnique({ where: { id: gameAccountId } });
  if (!account) {
    throw new AppError(404, "연결된 게임 계정을 찾을 수 없습니다.");
  }

  return prisma.championMastery.findMany({
    where: { gameAccountId },
    orderBy: { masteryPoints: "desc" },
    take: limit,
  });
}

// API 명세서: GET /game-accounts/:id/stats
export async function getGameAccountStats(gameAccountId: number) {
  const account = await prisma.gameAccount.findUnique({ where: { id: gameAccountId } });
  if (!account) {
    throw new AppError(404, "연결된 게임 계정을 찾을 수 없습니다.");
  }

  const [stats, positionStats] = await Promise.all([
    prisma.userGameStat.findUnique({ where: { gameAccountId } }),
    prisma.userPositionStat.findMany({ where: { gameAccountId } }),
  ]);

  return { stats, positionStats };
}
