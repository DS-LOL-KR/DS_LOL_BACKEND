import cron from "node-cron"; // 매일 정해진 시각에 자동 갱신 작업을 실행하기 위한 크론 스케줄러
import { logger } from "../lib/logger"; // 잡 실행 여부/결과를 로그로 남기기 위해 사용
import { refreshAllLinkedGameAccounts } from "../modules/game-accounts/game-accounts.service"; // 실제 갱신 로직(수동 refresh와 공유)

// 기능명세서: "전적 자동 갱신" — "자동으로 전적 갱신을 하는데 사용자가 직접 갱신할 수 있게
// 버튼 하나 만들 계획" (수동 갱신 버튼 쪽은 API 명세서 POST /game-accounts/:id/refresh).
// 이 잡은 그 자동 버전 — 매일 자정(한국 시간 00:00)에 전체 game_accounts(LOL)를
// 순회하며 동일한 로직 수행.
//
// timezone을 명시하지 않으면 node-cron이 서버(컨테이너)의 시스템 시간대를 그대로
// 씀 — Dockerfile/docker-compose.yml 어디에도 TZ를 안 정해뒀고, node:20-alpine
// 베이스 이미지는 기본이 UTC라서, 배포 환경에서는 "매일 0시"가 실제로는 한국
// 시간 오전 9시에 도는 등 의도와 다르게 돌고 있었을 가능성이 큼(2026-09-14 문의로
// 발견). Asia/Seoul을 명시해서 배포 환경의 시스템 시간대와 무관하게 항상 한국
// 시간 자정에 돌도록 고정.
//
// scheduleSyncGameAccountStatsJob()과 실제 작업(runSyncGameAccountStatsJob())을
// 분리해둔 이유: cron 스케줄을 기다리지 않고도 스크립트나 테스트에서 바로 실행해볼 수 있게.
export async function runSyncGameAccountStatsJob(): Promise<void> {
  logger.info("syncGameAccountStats job started");

  try {
    const result = await refreshAllLinkedGameAccounts();
    logger.info("syncGameAccountStats job finished", result);
  } catch (err) {
    logger.error("syncGameAccountStats job failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export function scheduleSyncGameAccountStatsJob(): void {
  cron.schedule(
    "0 0 * * *",
    () => {
      void runSyncGameAccountStatsJob();
    },
    { timezone: "Asia/Seoul" },
  );
}

export default scheduleSyncGameAccountStatsJob;
