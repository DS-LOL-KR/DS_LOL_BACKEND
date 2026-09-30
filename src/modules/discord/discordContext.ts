import type { Prisma } from "@prisma/client"; // 그룹/유저 행 타입
import { prisma } from "../../config/prisma"; // guild_id → 그룹, discord_user_id → 유저, 그룹 멤버십 조회
import { buildDiscordLinkUrl } from "./discordLink.service"; // 연결 안 된 사람에게 줄 계정 연결 링크
import { DISCORD_EPHEMERAL_FLAG, type DiscordInteractionResponse } from "./discord.types";

// 디스코드 버튼/명령어 핸들러(/내전모집, 팀·결과 카드, 매너 평가)가 공통으로 쓰는 것들.
// 서로를 import하며 순환하지 않도록 따로 뺌.

export function ephemeral(content: string): DiscordInteractionResponse {
  return { type: 4, data: { content, flags: DISCORD_EPHEMERAL_FLAG } };
}

export type GroupMemberContext =
  | { reply: DiscordInteractionResponse }
  | { group: Prisma.GroupGetPayload<object>; user: Prisma.UserGetPayload<object> };

// 디스코드 서버 → 연동된 그룹, 디스코드 유저 ID → 우리 유저, 그리고 그 그룹의 멤버인지까지
// 확인. 하나라도 안 되면 누른 사람에게만 보이는 안내 메시지를 돌려줌.
export async function resolveGroupMember(guildId: string, discordUserId: string): Promise<GroupMemberContext> {
  const group = await prisma.group.findUnique({ where: { discordGuildId: guildId } });
  if (!group) {
    return { reply: ephemeral("이 디스코드 서버에 연동된 그룹이 없어요. 그룹 관리 화면에서 먼저 연동해 주세요.") };
  }

  const user = await prisma.user.findUnique({ where: { discordUserId } });
  if (!user) {
    return {
      reply: ephemeral(
        `아직 DS_LOL 계정과 디스코드가 연결되지 않았어요. 아래 링크를 열어 연결한 뒤 다시 눌러 주세요. (10분 안에 열어야 해요)\n${buildDiscordLinkUrl(discordUserId)}`,
      ),
    };
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: user.id } },
  });
  if (!membership) {
    return {
      reply: ephemeral(`"${group.name}" 그룹에 가입돼 있지 않아요. 그룹장에게 초대 코드를 받아 먼저 가입해 주세요.`),
    };
  }

  return { group, user };
}

