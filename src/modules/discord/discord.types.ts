// 디스코드 인터랙션 요청 바디의 최소 타입 — 우리가 실제로 읽는 필드만 옮겨둠
// (전체 스펙: https://discord.com/developers/docs/interactions/receiving-and-responding).

// 1 = PING(엔드포인트 검증용), 2 = APPLICATION_COMMAND(슬래시 명령어 실행)
export type DiscordInteractionType = 1 | 2;

export interface DiscordInteractionOption {
  name: string;
  value: string | number | boolean;
}

export interface DiscordInteractionData {
  name: string;
  options?: DiscordInteractionOption[];
}

export interface DiscordInteraction {
  type: DiscordInteractionType;
  // 서버(길드) 밖 DM에서 명령어를 쓰면 없음 — 그룹 조회는 길드 전용이라 이 경우 안내만 함.
  guild_id?: string;
  data?: DiscordInteractionData;
}

// 4 = CHANNEL_MESSAGE_WITH_SOURCE(바로 채팅에 답장)
export interface DiscordInteractionResponse {
  type: 1 | 4;
  data?: { content: string };
}
