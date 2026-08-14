import cron from "node-cron"; // 매일 정해진 시각에 자동 갱신 작업을 실행하기 위한 크론 스케줄러
import { logger } from "../lib/logger"; // 잡이 실행됐는지 로그로 남기기 위해 사용

// 기능명세서: "전적 자동 갱신" — "자동으로 전적 갱신을 하는데 사용자가 직접 갱신할 수 있게
// 버튼 하나 만들 계획" (수동 갱신 버튼 쪽은 API 명세서 POST /game-accounts/:id/refresh,
// src/modules/game-accounts/game-accounts.service.ts의 refreshGameAccountStats).
// 이 잡은 그 자동 버전 — 매일 04:00에 전체 game_accounts를 순회하며 동일한 로직 수행.
export function scheduleSyncGameAccountStatsJob(): void {
  cron.schedule("0 4 * * *", async () => {
    // TODO: game_accounts 테이블의 모든 행에 대해 라이엇 API로 최신 전적을 조회하고
    // user_game_stats / user_position_stats를 갱신. refreshGameAccountStats()와
    // 로직을 공유할 수 있는지 검토.
    logger.info("syncGameAccountStats job triggered (not yet implemented)");
  });
}

export default scheduleSyncGameAccountStatsJob;
