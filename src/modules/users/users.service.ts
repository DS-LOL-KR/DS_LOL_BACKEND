import { prisma } from "../../config/prisma"; // users 테이블 조회/수정을 위해 사용
import { AppError } from "../../lib/AppError"; // 존재하지 않는 유저 조회 시 404를 명확하게 표현하기 위해 사용
import { saveProfileImage, deleteProfileImage } from "../../lib/storage/profileImageStorage"; // 로컬 디스크 vs S3 저장 방식 분기
import type { UpdateMeInput } from "./users.schema"; // PATCH /users/me 요청 바디의 형태를 명시하기 위해 사용

// 다른 사람에게 공개해도 되는 필드만 골라둠 — email은 개인정보라 공개 프로필
// (GET /users/:id)에서는 빼고, 본인 조회(GET /users/me)에서만 전체를 보여줌.
// gameAccounts(신규, 2026-08-30)는 다른 사람 프로필 화면에서 "전적"을 보여주려면
// game-accounts/:id/... 조회에 필요한 계정 id를 알아야 하는데, 그걸 넘겨주기
// 위해 추가함 — game-accounts 쪽 API는 로그인만 하면 누구든 조회 가능하게
// 이미 열려있어서(그룹 티어표 기능 특성상) 여기서 id만 노출해도 안전함.
const PUBLIC_USER_SELECT = {
  id: true,
  nickname: true,
  profileImageUrl: true,
  bio: true,
  createdAt: true,
  gameAccounts: { select: { id: true, gameId: true } },
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
// 저장 방식(로컬 디스크 vs S3)은 profileImageStorage.ts가 env.isS3Configured로
// 알아서 고름 — 2026-09-09, AWS 계정을 아직 안 붙여서 지금은 항상 로컬 디스크로
// 저장됨. 나중에 AWS_* 환경변수만 채우면 이 코드는 그대로 두고 바로 S3로 전환됨.
export async function updateProfileImage(userId: number, file: Express.Multer.File) {
  const previous = await prisma.user.findUnique({
    where: { id: userId },
    select: { profileImageUrl: true },
  });

  const profileImageUrl = await saveProfileImage(file, userId);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { profileImageUrl },
  });

  // 이전에 업로드해둔 이미지가 있으면 계속 쌓이지 않게 지움 (로컬이면 디스크,
  // S3면 버킷에서). 외부 URL(구글 프로필 사진 등)이었을 가능성은
  // deleteProfileImage 내부에서 접두사를 확인해 걸러냄.
  if (previous?.profileImageUrl) {
    await deleteProfileImage(previous.profileImageUrl);
  }

  return user;
}
