import { z } from "zod"; // 요청 바디 검증 스키마를 정의하기 위해 사용

// 기능명세서: "그룹생성" — 내전을 같이 할 그룹을 생성함
// API 명세서: POST /groups
export const createGroupSchema = z.object({
  name: z.string().min(1),
  gameId: z.number().int().positive(), // ERD: groups.game_id ("이 그룹이 내전하는 게임 종목")
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

// 기능명세서: "그룹 키" — 그룹에 들어갈 수 있게 키(초대 코드) 생성
// API 명세서: POST /groups/join
export const joinGroupSchema = z.object({
  inviteCode: z.string().min(1),
});

export type JoinGroupInput = z.infer<typeof joinGroupSchema>;

// 기능명세서: "그룹장 위임"
// API 명세서: PATCH /groups/:id/owner
export const transferOwnerSchema = z.object({
  newOwnerId: z.number().int().positive(),
});

export type TransferOwnerInput = z.infer<typeof transferOwnerSchema>;

// API 명세서: PATCH /groups/:id/discord-webhook
// null을 보내면 알림 끄기(연동 해제). 빈 문자열은 굳이 허용 안 함 — 끄고 싶으면
// null로 명확하게 보내게 함.
export const updateDiscordWebhookSchema = z.object({
  webhookUrl: z.string().url().startsWith("https://discord.com/api/webhooks/").nullable(),
});

export type UpdateDiscordWebhookInput = z.infer<typeof updateDiscordWebhookSchema>;
