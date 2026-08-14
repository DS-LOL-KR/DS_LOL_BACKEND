import { z } from "zod"; // 요청 바디 검증 스키마를 정의하기 위해 사용

// 기능명세서: "자기소개"(마크다운), "이름설정" (프로필 설정 카테고리)
// API 명세서: PATCH /users/me
export const updateMeSchema = z.object({
  nickname: z.string().min(1).optional(),
  bio: z.string().max(2000).optional(), // 마크다운 형식 — 기능명세서 "자기소개" 참고
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>;

// 기능명세서: "프로필 이미지" — "이미지를 직접 사용자가 파일을 넣어 입력할 수 있음"
// API 명세서: POST /users/me/profile-image
// TODO: multipart/form-data 업로드이므로 zod로 바디를 검증하지 않고 multer 등
// 파일 업로드 미들웨어가 필요함. 스토리지(S3 등) 연동 방식도 정해야 함.
