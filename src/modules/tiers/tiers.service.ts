import { prisma } from "../../config/prisma"; // groups, group_members, game_accounts 등 테이블 접근
import { AppError } from "../../lib/AppError"; // 그룹이 없을 때 404를 명확하게 표현하기 위해 사용
import { recalculateInternalMmr } from "../../lib/mmr"; // official_tier 기반 internal_mmr 계산 (game-accounts.service.ts와 공유)
import type { ListTiersQuery } from "./tiers.schema"; // GET /groups/:id/tiers 쿼리(position)의 형태를 명시하기 위해 사용

export interface TierEntry {
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
  position: string;
  officialTier: string | null;
  internalMmr: number;
  positionMmr: number;
  tier: 1 | 2 | 3 | 4 | 5;
  wins: number;
  losses: number;
}

export interface TierTable {
  tiers: TierEntry[];
  // 그룹원들의 game_account 통계(내부 MMR·티어) 중 가장 최근에 갱신된 시각 —
  // 화면에 "n시간 전 갱신"으로 표시하는 값이 예전엔 고정 문구("2시간 전")였어서
  // 실제 데이터 기준으로 바꿈. 연동된 계정이 하나도 없으면 null.
  lastUpdatedAt: string | null;
}

async function buildTierEntries(groupId: number, query: ListTiersQuery): Promise<TierTable> {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) {
    throw new AppError(404, "그룹을 찾을 수 없습니다.");
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: { select: { id: true, nickname: true, profileImageUrl: true } } },
  });

  const memberInfos = await Promise.all(
    members.map(async (member) => {
      // 그룹의 게임 종목(group.gameId) 기준으로 이 멤버가 연결해둔 계정을 찾음.
      const gameAccount = await prisma.gameAccount.findUnique({
        where: { userId_gameId: { userId: member.userId, gameId: group.gameId } },
        include: {
          stats: true,
          positionStats: query.position ? { where: { position: query.position } } : true,
        },
      });

      return {
        userId: member.userId,
        nickname: member.user.nickname,
        profileImageUrl: member.user.profileImageUrl,
        officialTier: gameAccount?.stats?.officialTier ?? null,
        internalMmr: gameAccount?.stats?.internalMmr ?? 1000,
        positions: gameAccount?.positionStats ?? [],
        statsUpdatedAt: gameAccount?.stats?.updatedAt ?? null,
      };
    }),
  );

  const lastUpdatedAt = memberInfos.reduce<Date | null>((latest, member) => {
    if (!member.statsUpdatedAt) return latest;
    if (!latest || member.statsUpdatedAt > latest) return member.statsUpdatedAt;
    return latest;
  }, null);

  // internal_mmr 내림차순 순위를 상위 20%씩 5개 구간(1~5티어)으로 나눔.
  // position 쿼리 필터와 무관하게 그룹 전체 순위로 계산해서, 라인 탭을 바꿔도
  // 같은 사람의 티어 숫자가 흔들리지 않게 함.
  const ranked = [...memberInfos].sort((a, b) => b.internalMmr - a.internalMmr);
  const tierByUserId = new Map<number, 1 | 2 | 3 | 4 | 5>();
  ranked.forEach((member, index) => {
    const percentile = index / ranked.length;
    const tier = (Math.min(4, Math.floor(percentile * 5)) + 1) as 1 | 2 | 3 | 4 | 5;
    tierByUserId.set(member.userId, tier);
  });

  // 라인 기록(user_position_stats)이 있는 라인마다 한 줄씩 펼쳐서 반환.
  // 계정 미연동이거나 해당 라인 기록이 없는 멤버는 그 라인에 줄이 생기지 않음.
  const entries: TierEntry[] = [];
  for (const member of memberInfos) {
    for (const positionStat of member.positions) {
      const wins = Math.round(positionStat.gamesPlayed * positionStat.winRate);
      entries.push({
        userId: member.userId,
        nickname: member.nickname,
        profileImageUrl: member.profileImageUrl,
        position: positionStat.position,
        officialTier: member.officialTier,
        internalMmr: member.internalMmr,
        positionMmr: positionStat.positionMmr,
        tier: tierByUserId.get(member.userId) ?? 5,
        wins,
        losses: positionStat.gamesPlayed - wins,
      });
    }
  }

  return { tiers: entries, lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null };
}

// 기능명세서: "티어표 한눈에 보기" / "라인별 티어선정"
// API 명세서: GET /groups/:id/tiers (position 쿼리로 라인 필터)
export async function listTiers(groupId: number, query: ListTiersQuery) {
  return buildTierEntries(groupId, query);
}

// API 명세서: POST /groups/:id/tiers/recalculate
export async function recalculateTiers(groupId: number) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) {
    throw new AppError(404, "그룹을 찾을 수 없습니다.");
  }

  const members = await prisma.groupMember.findMany({ where: { groupId } });

  await Promise.all(
    members.map(async (member) => {
      const gameAccount = await prisma.gameAccount.findUnique({
        where: { userId_gameId: { userId: member.userId, gameId: group.gameId } },
        include: { stats: true },
      });

      if (!gameAccount) {
        return; // 이 게임에 연결된 계정이 없으면 계산할 게 없음 — 건너뜀
      }

      const currentInternalMmr = gameAccount.stats?.internalMmr ?? 1000;
      const mannerScore = gameAccount.stats?.mannerScore ?? 3.5;
      const officialTier = gameAccount.stats?.officialTier ?? null;
      const newInternalMmr = recalculateInternalMmr(officialTier, currentInternalMmr, mannerScore);

      await prisma.userGameStat.upsert({
        where: { gameAccountId: gameAccount.id },
        update: { internalMmr: newInternalMmr },
        create: { gameAccountId: gameAccount.id, internalMmr: newInternalMmr },
      });
    }),
  );

  return buildTierEntries(groupId, {});
}
