import cron from "node-cron"; // 5분마다 자동 판정을 돌리기 위한 크론 스케줄러
import { logger } from "../lib/logger"; // 잡 실행 여부/결과를 로그로 남기기 위해 사용
import { attemptAutoFinishMatches } from "../modules/matches/matches.service"; // 실제 판정 로직

// 사용자 요청: "승패를 사람이 직접 고르는 게 아니라, 내전이 만들어지고 나면
// 라이엇 전적을 계속 들고오는 식으로" — MATCHED 상태인 내전들을 5분마다 훑어서
// 참가자들의 실제 라이엇 전적과 배정된 팀이 일치하면 자동으로 FINISHED 처리함.
// 수동 "팀 A/B 승리" 버튼은 그대로 남아있어 언제든 직접 처리 가능.
export async function runAutoFinishMatchesJob(): Promise<void> {
  logger.info("autoFinishMatches job started");

  try {
    const result = await attemptAutoFinishMatches();
    logger.info("autoFinishMatches job finished", result);
  } catch (err) {
    logger.error("autoFinishMatches job failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export function scheduleAutoFinishMatchesJob(): void {
  cron.schedule("*/5 * * * *", () => {
    void runAutoFinishMatchesJob();
  });
}

export default scheduleAutoFinishMatchesJob;
