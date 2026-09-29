// 디스코드 인터랙션 요청 바디의 최소 타입 — 우리가 실제로 읽는 필드만 옮겨둠
// (전체 스펙: https://discord.com/developers/docs/interactions/receiving-and-responding).

// 1 = PING(엔드포인트 검증용), 2 = APPLICATION_COMMAND(슬래시 명령어 실행),
// 3 = MESSAGE_COMPONENT(메시지에 붙은 버튼 클릭 — /내전모집의 참가/확정 등)
export type DiscordInteractionType = 1 | 2 | 3;

export interface DiscordInteractionOption {
  name: string;
  value: string | number | boolean;
}

export interface DiscordInteractionData {
  // 슬래시 명령어일 때
  name?: string;
  options?: DiscordInteractionOption[];
  // 버튼 클릭일 때 — 버튼을 만들 때 우리가 넣어둔 값(예: "recruit:join:12")
  custom_id?: string;
}

export interface DiscordUser {
  // 스노우플레이크 ID — 닉네임과 달리 절대 안 바뀌어서 우리 유저와 연결하는 키로 씀
  id: string;
}

export interface DiscordInteraction {
  type: DiscordInteractionType;
  // 서버(길드) 밖 DM에서 명령어를 쓰면 없음 — 그룹 조회는 길드 전용이라 이 경우 안내만 함.
  guild_id?: string;
  // 서버 안에서 누르면 member.user, DM이면 user로 옴
  member?: { user: DiscordUser };
  user?: DiscordUser;
  data?: DiscordInteractionData;
}

// 버튼 스타일: 1 = 파랑(Primary), 2 = 회색(Secondary), 3 = 초록(Success), 4 = 빨강(Danger)
export interface DiscordButton {
  type: 2;
  style: 1 | 2 | 3 | 4;
  label: string;
  custom_id: string;
  disabled?: boolean;
}

// type 1 = ACTION_ROW(버튼을 한 줄로 묶는 컨테이너, 한 줄에 최대 5개)
export interface DiscordActionRow {
  type: 1;
  components: DiscordButton[];
}

// 64 = EPHEMERAL(누른 사람에게만 보이는 메시지)
export const DISCORD_EPHEMERAL_FLAG = 64;

// 4 = CHANNEL_MESSAGE_WITH_SOURCE(새 메시지로 답장),
// 7 = UPDATE_MESSAGE(버튼이 붙어 있던 그 메시지를 수정 — 모집 인원 갱신 등)
export interface DiscordInteractionResponse {
  type: 1 | 4 | 7;
  data?: {
    content: string;
    components?: DiscordActionRow[];
    flags?: number;
  };
}
