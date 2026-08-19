import { PrismaClient } from "@prisma/client"; // 시드 데이터를 DB에 직접 넣기 위한 Prisma 클라이언트

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // games는 마스터 데이터라 매번 실행해도 안전하게 upsert. 지금은 실제로 라이엇 API
  // 연동을 구현한 LOL만 넣음 — VALORANT 등은 해당 게임 API 연동을 실제로 붙인 뒤에 추가.
  await prisma.game.upsert({
    where: { code: "LOL" },
    update: {},
    create: { name: "League of Legends", code: "LOL" },
  });
  console.log("시드 완료: games 테이블에 LOL 추가됨");

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
