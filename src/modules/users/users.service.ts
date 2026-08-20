import fs from "node:fs"; // 프로필 이미지 교체 시 이전 파일을 로컬 디스크에서 지우기 위해 사용
import path from "node:path"; // 이전 이미지 파일 경로를 조합하기 위해 사용
import { prisma } from "../../config/prisma"; // users 테이블 조회/수정을 위해 사용
import { AppError } from "../../lib/AppError"; // 존재하지 않는 유저 조회 시 404를 명확하게 표현하기 위해 사용
import type { UpdateMeInput } from "./users.schema"; // PATCH /users/me 요청 바디의 형태를 명시하기 위해 사용

// 다른 사람에게 공개해도 되는 필드만 골라둠 — email은 개인정보라 공개 프로필
// (GET /users/:id)에서는 빼고, 본인 조회(GET /users/me)에서만 전체를 보여줌.
const PUBLIC_USER_SELECT = {
  id: true,
  nickname: true,
  profileImageUrl: true,
  bio: true,
  createdAt: true,
} as const;

// API 명세서: GET /users/me
export async function getMe(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AppError(404, "사용자를 찾을 수 없습니다.");
  }

  return user;
}

// API 명세서: GET /users/:id — 다른 사용자 프로필 조회 (공개 정보만)
export async function getUserById(id: number) {
  const user = await prisma.user.findUnique({ where: { id }, select: PUBLIC_USER_SELECT });

  if (!user) {
    throw new AppError(404, "사용자를 찾을 수 없습니다.");
  }

  return user;
}

// 기능명세서: "자기소개", "이름설정"
// API 명세서: PATCH /users/me
export async function updateMe(userId: number, input: UpdateMeInput) {
  return prisma.user.update({
    where: { id: userId },
    data: input,
  });
}

// 기능명세서: "프로필 이미지"
// API 명세서: POST /users/me/profile-image
// 로컬 디스크 저장 방식으로 결정 (2026-08-20) — profileImageUpload.middleware.ts가
// uploads/profile-images/에 파일을 저장해두고, 여기서는 그 파일명만 받아서
// DB의 profileImageUrl을 "/uploads/profile-images/<파일명>" 형태로 갱신함.
export async function updateProfileImage(userId: number, filename: string) {
  const previous = await prisma.user.findUnique({
    where: { id: userId },
    select: { profileImageUrl: true },
  });

  const user = await prisma.user.update({
    where: { id: userId },
    data: { profileImageUrl: `/uploads/profile-images/${filename}` },
  });

  // 이전에 업로드해둔 이미지가 있으면 디스크에 계속 쌓이지 않게 지움. 우리가
  // 만든 경로가 아닌 값(외부 URL 등)이었을 가능성을 대비해 접두사를 확인.
  if (previous?.profileImageUrl?.startsWith("/uploads/profile-images/")) {
    const oldPath = path.join(process.cwd(), previous.profileImageUrl);
    fs.unlink(oldPath, () => {
      // 이미 지워졌거나 없는 파일이어도 상관없어서 에러는 무시.
    });
  }

  return user;
}
