import { prisma } from "../../config/prisma"; // groups, group_members, game_accounts 등 테이블 접근
import { AppError } from "../../lib/AppError"; // 그룹이 없을 때 404를 명확하게 표현하기 위해 사용
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
        linked: gameAccount !== null,
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
  // 게임 계정을 아예 연동 안 한 멤버는 화면에 줄도 안 생기는데 순위 계산에는
  // 기본값(1000)으로 끼어서 등급 경계를 은근히 밀어버리는 문제가 있어 제외함
  // (2026-08-28, 실제 그룹에서 발견).
  const ranked = memberInfos.filter((m) => m.linked).sort((a, b) => b.internalMmr - a.internalMmr);
  const tierByUserId = new Map<number, 1 | 2 | 3 | 4 | 5>();
  ranked.forEach((member, index) => {
    const percentile = index / ranked.length;
    let tier = (Math.min(4, Math.floor(percentile * 5)) + 1) as 1 | 2 | 3 | 4 | 5;

    // internal_mmr이 바로 위 순위와 완전히 같으면(동점) 정렬 순서(우연한 인덱스)
    // 때문에 등급이 갈리지 않도록 같은 등급으로 묶음 — 실제로 두 멤버가 같은
    // internal_mmr인데 한 명만 1티어, 한 명은 2티어로 나오는 문제가 있었음.
    const prevMember = ranked[index - 1];
    if (prevMember && prevMember.internalMmr === member.internalMmr) {
      tier = tierByUserId.get(prevMember.userId) ?? tier;
    }

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
// internal_mmr 자체는 여기서 다시 계산하지 않음(2026-08-28) — 공식 티어가 바뀌면
// game-accounts.service.ts(지금 갱신)에서, 매너점수가 바뀌면 matches.service.ts
// (평가 반영 시점)에서 이미 internal_mmr에 반영해둠. 이 버튼을 누를 때마다 여기서
// 또 recalculateInternalMmr을 돌리면 아무것도 안 바뀐 상태에서도 값이 계속
// 움직이는 버그가 있었음(같은 입력을 자기 자신에 60% 가중치로 계속 섞어넣는 구조라
// 누를 때마다 목표값 쪽으로 조금씩 더 다가감). 그래서 이미 정확한 internal_mmr을
// 그대로 읽어서 그룹 안 순위/티어 등급표만 다시 만듦.
export async function recalculateTiers(groupId: number) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) {
    throw new AppError(404, "그룹을 찾을 수 없습니다.");
  }

  return buildTierEntries(groupId, {});
}
