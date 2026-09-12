import axios from "axios"; // 디스코드 웹후크는 그냥 평범한 HTTPS POST라 axios로 충분함
import { logger } from "./logger"; // 알림 발송 실패를 조용히 삼키지 않고 로그로 남기기 위해 사용

// 디스코드 "수신 웹후크"(채널 설정 > 연동 > 웹후크)로 메시지를 보냄. 봇 등록/
// OAuth 없이 그 채널 전용 URL에 POST 한 번이면 끝 — 대신 완전히 단방향(응답을
// 안 읽음)이라 우리 쪽에서 "누가 읽었는지" 같은 건 알 수 없음.
// 실패해도(URL이 잘못됐거나, 디스코드가 잠깐 안 되거나) 호출부의 실제 기능
// (팀 구성/내전 종료 등)을 절대 실패시키면 안 되므로 항상 조용히 무시함.
export async function sendDiscordNotification(webhookUrl: string, content: string): Promise<void> {
  try {
    await axios.post(webhookUrl, { content }, { timeout: 5000 });
  } catch (err) {
    logger.error("Discord webhook notification failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
