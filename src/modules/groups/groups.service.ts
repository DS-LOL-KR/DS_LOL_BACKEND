import crypto from "node:crypto"; // 초대 코드용 랜덤 문자열 생성에 사용
import { Prisma } from "@prisma/client"; // 유니크 제약 위반(P2002) 종류를 구분하기 위해 사용
import { prisma } from "../../config/prisma"; // groups, group_members 테이블 접근
import { AppError } from "../../lib/AppError"; // 400/403/404/409 등 의도된 에러를 명확하게 표현하기 위해 사용
import type { CreateGroupInput, JoinGroupInput, TransferOwnerInput } from "./groups.schema"; // 각 요청 바디의 형태를 명시하기 위해 사용

// 8자리 대문자 16진수 (예: "A1B2C3D4") — 충돌 가능성은 극히 낮지만, 혹시 겹치면
// 아래에서 재시도하도록 되어있음.
function generateInviteCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

// 기능명세서: "그룹생성"
// API 명세서: POST /groups
// invite_code 생성 + groups 행 생성 + 생성자를 group_members에 role="OWNER"로
// 추가하는 것을 하나의 트랜잭션으로 처리. invite_code가 우연히 겹치면(P2002)
// 재시도.
export async function createGroup(ownerId: number, input: CreateGroupInput) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = generateInviteCode();
    try {
      return await prisma.$transaction(async (tx) => {
        const group = await tx.group.create({
          data: { name: input.name, gameId: input.gameId, ownerId, inviteCode },
        });
        await tx.groupMember.create({
          data: { groupId: group.id, userId: ownerId, role: "OWNER" },
        });
        return group;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        continue; // invite_code 충돌 — 새 코드로 재시도
      }
      throw err;
    }
  }
  throw new AppError(500, "초대 코드 생성에 실패했습니다. 다시 시도해주세요.");
}

// API 명세서: GET /groups
// "내가 속한 그룹만" vs "전체 그룹" 중 명세서에 상세가 없어, group_members
// 기준으로 내가 속한 그룹만 보여주는 쪽으로 결정.
export async function listGroups(userId: number) {
  return prisma.group.findMany({
    where: { members: { some: { userId } } },
  });
}

// 기능명세서: "그룹원 목록 보기"
// API 명세서: GET /groups/:id
// 별도 "멤버 목록" 엔드포인트가 명세서에 없어서, 그룹 상세 조회에 멤버 목록을 포함시킴.
export async function getGroupById(groupId: number) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: { user: { select: { id: true, nickname: true, profileImageUrl: true } } },
      },
    },
  });

  if (!group) {
    throw new AppError(404, "그룹을 찾을 수 없습니다.");
  }

  return group;
}

// 기능명세서: "그룹 삭제"
// API 명세서: DELETE /groups/:id
// custom_matches 등 다른 연관 데이터는 아직 실제로 생성될 수 없는 단계(matches
// 모듈 미구현)라 group_members만 정리하고 그룹을 지움.
export async function deleteGroup(groupId: number): Promise<void> {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) {
    throw new AppError(404, "그룹을 찾을 수 없습니다.");
  }

  await prisma.$transaction([
    prisma.groupMember.deleteMany({ where: { groupId } }),
    prisma.group.delete({ where: { id: groupId } }),
  ]);
}

// 기능명세서: "그룹장 위임" — "그룹을 만든사람은 이미 그룹장인데 넘겨주기 가능"
// API 명세서: PATCH /groups/:id/owner
export async function transferOwner(groupId: number, input: TransferOwnerInput) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) {
    throw new AppError(404, "그룹을 찾을 수 없습니다.");
  }
  if (input.newOwnerId === group.ownerId) {
    throw new AppError(400, "이미 그룹장입니다.");
  }

  const newOwnerMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: input.newOwnerId } },
  });
  if (!newOwnerMembership) {
    throw new AppError(404, "그룹 멤버가 아닌 유저에게는 그룹장을 위임할 수 없습니다.");
  }

  const [updatedGroup] = await prisma.$transaction([
    prisma.group.update({ where: { id: groupId }, data: { ownerId: input.newOwnerId } }),
    prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId: input.newOwnerId } },
      data: { role: "OWNER" },
    }),
    prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId: group.ownerId } },
      data: { role: "MEMBER" },
    }),
  ]);

  return updatedGroup;
}

// 기능명세서: "그룹 키" — 초대 코드로 그룹 참가
// API 명세서: POST /groups/join
export async function joinGroup(userId: number, input: JoinGroupInput) {
  const group = await prisma.group.findUnique({ where: { inviteCode: input.inviteCode } });
  if (!group) {
    throw new AppError(404, "유효하지 않은 초대 코드입니다.");
  }

  try {
    return await prisma.groupMember.create({
      data: { groupId: group.id, userId, role: "MEMBER" },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "이미 참가 중인 그룹입니다.");
    }
    throw err;
  }
}

// 기능명세서: "초대 링크/코드 재발급" — "모르는 사람에게 알려졌을 때 변경할 수 있게"
// API 명세서: POST /groups/:id/invite-code/refresh
export async function refreshInviteCode(groupId: number) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) {
    throw new AppError(404, "그룹을 찾을 수 없습니다.");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = generateInviteCode();
    try {
      return await prisma.group.update({ where: { id: groupId }, data: { inviteCode } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        continue;
      }
      throw err;
    }
  }
  throw new AppError(500, "초대 코드 재발급에 실패했습니다. 다시 시도해주세요.");
}

// API 명세서: DELETE /groups/:id/members/me — 그룹 탈퇴
// 정책 결정: 그룹장은 바로 탈퇴할 수 없고, 먼저 그룹장을 위임한 뒤에 탈퇴해야 함
// (그룹장 없는 그룹이 생기는 걸 방지).
export async function leaveGroup(groupId: number, userId: number): Promise<void> {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) {
    throw new AppError(404, "그룹 멤버가 아닙니다.");
  }
  if (membership.role === "OWNER") {
    throw new AppError(409, "그룹장은 먼저 그룹장 위임 후 탈퇴할 수 있습니다.");
  }

  await prisma.groupMember.delete({ where: { groupId_userId: { groupId, userId } } });
}

// 기능명세서: "그룹 추방" — "그룹 안에 있는 팀원을 추방할 수 있음"
// API 명세서: DELETE /groups/:id/members/:userId
export async function removeMember(groupId: number, targetUserId: number): Promise<void> {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });
  if (!membership) {
    throw new AppError(404, "그룹 멤버가 아닙니다.");
  }
  if (membership.role === "OWNER") {
    throw new AppError(409, "그룹장은 추방할 수 없습니다.");
  }

  await prisma.groupMember.delete({ where: { groupId_userId: { groupId, userId: targetUserId } } });
}
