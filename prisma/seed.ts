import { PrismaClient } from "@prisma/client"; // 시드 데이터를 DB에 직접 넣기 위한 Prisma 클라이언트

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // games는 마스터 데이터라 매번 실행해도 안전하게 upsert.
  await prisma.game.upsert({
    where: { code: "LOL" },
    update: {},
    create: { name: "League of Legends", code: "LOL" },
  });
  // 계정 연동(라이엇 Account-V1으로 puuid 확보)까지만 붙임(2026-09-13) — 전적 갱신/
  // 매치 동기화 등은 아직 LOL 전용(League-V4, Match-V5 등)이라 game-accounts.service.ts
  // 에서 VALORANT 계정은 별도 지원 전까지 막아둠.
  await prisma.game.upsert({
    where: { code: "VALORANT" },
    update: {},
    create: { name: "Valorant", code: "VALORANT" },
  });
  console.log("시드 완료: games 테이블에 LOL, VALORANT 추가됨");

  // TODO: 나머지 ERD 기준 개발용 시드 데이터 채우기.
  // 순서 예시: users -> game_accounts -> user_game_stats / user_position_stats
  // -> groups -> group_members -> custom_matches -> custom_match_participants -> user_evaluations
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export default main;
