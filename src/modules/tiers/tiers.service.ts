import { prisma } from "../../config/prisma"; // groups, group_members, game_accounts 등 테이블 접근
import { AppError } from "../../lib/AppError"; // 그룹이 없을 때 404를 명확하게 표현하기 위해 사용
import type { ListTiersQuery } from "./tiers.schema"; // GET /groups/:id/tiers 쿼리(position)의 형태를 명시하기 위해 사용

// 라이엇 랭크 순서 (낮음 → 높음). MASTER 이상은 디비전이 없음.
const RANK_ORDER = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
];
const DIVISION_BONUS: Record<string, number> = { IV: 0, III: 100, II: 200, I: 300 };

// "PLATINUM II" 같은 official_tier 문자열을 internal_mmr와 같은 스케일의 점수로
// 변환. SILVER II가 정확히 1000이 되도록 맞춰서, official_tier가 없는(언랭)
// 유저의 기준값과 internal_mmr 기본값(1000)이 같은 출발선에 서게 함.
function officialTierToScore(officialTier: string | null): number {
  if (!officialTier) return 1000;

  const [rankName, division] = officialTier.trim().toUpperCase().split(" ");
  const rankIndex = RANK_ORDER.indexOf(rankName);
  if (rankIndex === -1) return 1000;

  const divisionBonus = DIVISION_BONUS[division] ?? 300; // MASTER 이상은 디비전이 없어 최고 보너스로 취급
  return rankIndex * 400 + divisionBonus;
}

// 기능명세서: "전체 티어선정" — "전적 + 티어 + 사용자 평가를 이용해 그룹 안에
// 티어를 선정함". 가중치: 라이엇 공식 티어 70% + 기존 internal_mmr 20% +
// 매너 평가(기준 3.5 대비 편차) 10%.
// TODO: matches/evaluations가 아직 구현 전이라 지금은 internal_mmr·manner_score가
// 전원 기본값(1000, 3.5)이라 실질적으로 official_tier가 거의 다 결정함. 실제
// 내전 결과/평가가 쌓이면 이 공식 그대로 반영 비중이 자연스럽게 늘어남.
function recalculateInternalMmr(
  officialTier: string | null,
  currentInternalMmr: number,
  mannerScore: number,
): number {
  const tierScore = officialTierToScore(officialTier);
  const mannerAdjustment = (mannerScore - 3.5) * 100;
  return Math.round(tierScore * 0.7 + currentInternalMmr * 0.2 + mannerAdjustment * 0.1);
}

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

async function buildTierEntries(groupId: number, query: ListTiersQuery): Promise<TierEntry[]> {
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
      };
    }),
  );

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

  return entries;
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
