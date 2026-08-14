import { PrismaClient } from "@prisma/client"; // 시드 데이터를 DB에 직접 넣기 위한 Prisma 클라이언트

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // TODO: ERD 기준 개발용 시드 데이터 채우기.
  // 순서 예시: games -> users -> game_accounts -> user_game_stats / user_position_stats
  // -> groups -> group_members -> custom_matches -> custom_match_participants -> user_evaluations
  console.log("시드 스크립트는 아직 스텁 상태입니다 - 생성된 데이터가 없습니다.");
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
