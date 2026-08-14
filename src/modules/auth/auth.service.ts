import type { GoogleCallbackQuery } from "./auth.schema"; // 구글 콜백 쿼리(code)의 형태를 명시하기 위해 사용

// 기능명세서: "로그인" — 구글 OAuth로 로그인
// API 명세서: GET /auth/google
// TODO: google-auth-library로 구글 OAuth 인증 URL을 생성해서 반환(또는 302 redirect).
export async function buildGoogleAuthUrl(): Promise<string> {
  throw new Error("Not implemented");
}

// 기능명세서: "로그인" — 구글 OAuth 콜백 처리
// API 명세서: GET /auth/google/callback
// TODO: 1) code를 구글 토큰으로 교환 2) 구글 프로필(email)로 users 테이블 조회/생성
//       3) JWT 발급. ERD의 users.password_hash를 어떻게 채울지(OAuth 전용이면 nullable
//       전환 필요) 먼저 정해야 함 — prisma/schema.prisma의 User 모델 주석 참고.
export async function handleGoogleCallback(
  query: GoogleCallbackQuery,
): Promise<{ token: string }> {
  throw new Error("Not implemented");
}

// 기능명세서: "로그아웃" — "구글 id를 빼서 로그아웃"
// API 명세서: POST /auth/logout
// TODO: 쿠키에 저장된 JWT/세션을 제거. 서버 상태를 안 쓰면(stateless JWT) 클라이언트
// 쿠키 삭제만으로 충분한지, 서버 측 토큰 무효화(블랙리스트 등)가 필요한지 확인.
export async function logout(): Promise<void> {
  throw new Error("Not implemented");
}
