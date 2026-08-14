import type { UpdateMeInput } from "./users.schema"; // PATCH /users/me 요청 바디의 형태를 명시하기 위해 사용

// API 명세서: GET /users/me
// TODO: users 테이블에서 조회하되 password_hash는 응답에서 반드시 제외.
export async function getMe(userId: number): Promise<unknown> {
  throw new Error("Not implemented");
}

// API 명세서: GET /users/:id — 다른 사용자 프로필 조회 (공개 정보만)
export async function getUserById(id: number): Promise<unknown> {
  throw new Error("Not implemented");
}

// 기능명세서: "자기소개", "이름설정"
// API 명세서: PATCH /users/me
export async function updateMe(userId: number, input: UpdateMeInput): Promise<unknown> {
  throw new Error("Not implemented");
}

// 기능명세서: "프로필 이미지"
// API 명세서: POST /users/me/profile-image
// TODO: 업로드된 파일을 스토리지에 저장하고 users.profile_image_url을 갱신.
export async function updateProfileImage(userId: number, file: unknown): Promise<unknown> {
  throw new Error("Not implemented");
}
