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
// TODO: 파일 업로드(multer 등)와 저장 위치(로컬 디스크 vs S3 등 클라우드 스토리지)를
// 먼저 정해야 함 — auth/users 기본 CRUD 끝난 뒤 별도로 다시 다룰 예정.
export async function updateProfileImage(userId: number, file: unknown): Promise<unknown> {
  throw new Error("Not implemented");
}
