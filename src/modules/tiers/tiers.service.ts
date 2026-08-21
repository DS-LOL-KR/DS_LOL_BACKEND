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

async function buildTierEntries(groupId: number, query: ListTiersQuery) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) {
    throw new AppError(404, "그룹을 찾을 수 없습니다.");
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: { select: { id: true, nickname: true, profileImageUrl: true } } },
  });

  const entries = await Promise.all(
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
        role: member.role,
        hasLinkedAccount: gameAccount !== null,
        officialTier: gameAccount?.stats?.officialTier ?? null,
        internalMmr: gameAccount?.stats?.internalMmr ?? null,
        mannerScore: gameAccount?.stats?.mannerScore ?? null,
        positions: gameAccount?.positionStats ?? [],
      };
    }),
  );

  // position 필터가 있으면, 그 라인 기록이 없는 멤버는 결과에서 제외.
  if (query.position) {
    return entries.filter((entry) => entry.positions.length > 0);
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
