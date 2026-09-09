import "dotenv/config"; // .env 파일을 process.env로 로드 (부수효과만 있는 import, 값을 직접 쓰지 않음)
import { z } from "zod"; // 환경변수가 필수인지/형식이 맞는지 스키마로 검증하기 위해 사용

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  // 구글 콘솔에 등록한 승인된 리디렉션 URI와 한 글자도 다르면 안 됨 (예:
  // http://localhost:4000/api/auth/google/callback)
  GOOGLE_REDIRECT_URI: z.string().min(1, "GOOGLE_REDIRECT_URI is required"),

  RIOT_API_KEY: z.string().min(1, "RIOT_API_KEY is required"),
  RIOT_REGION: z.string().default("kr"),

  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  // 프로필 이미지를 S3(또는 R2 등 S3 호환 스토리지)에 저장하려면 이 4개를 전부
  // 채워야 함 — 하나라도 비어있으면 지금처럼 로컬 디스크 저장으로 동작함
  // (2026-09-09, AWS 계정 연결 전이라 당장은 로컬 디스크 그대로 씀). optional로
  // 둔 이유: 이 값들이 없어도 서버가 정상 기동해야 하기 때문.
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  // S3 객체에 접근할 공개 URL의 베이스 — CloudFront를 쓰면 그 도메인, 아니면
  // 버킷의 기본 S3 URL(https://<bucket>.s3.<region>.amazonaws.com)을 넣음.
  // 안 채우면 기본 S3 URL 형태로 자동 조합함.
  AWS_S3_PUBLIC_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema> & {
  // 프론트(Vercel)와 백엔드(ngrok)가 서로 다른 도메인으로 배포된 경우처럼, 쿠키
  // 관점에서 "cross-site"인 배포인지. localhost가 아니면 전부 cross-site로 취급 —
  // 이 경우 인증 쿠키는 SameSite=None + Secure가 아니면 브라우저가 fetch/XHR
  // 요청에 아예 안 실어 보내서 로그인 직후에도 계속 401이 남(실제로 이 문제로
  // 로그인→401→재로그인 무한 루프가 발생했었음, 2026-08-26 발견).
  isCrossSiteDeployment: boolean;
  // 위 AWS_* 4개가 전부 채워졌는지 — profileImageUpload.middleware.ts와
  // profileImageStorage.ts가 이 값으로 "로컬 디스크 vs S3" 저장 방식을 고름.
  isS3Configured: boolean;
};

// TODO: 테스트에서 환경변수를 쉽게 스텁할 수 있도록, 이 값을 나중에 필요할 때
// 지연 평가(lazy)하는 방식으로 바꾸는 것도 고려해볼 것.
const parsedEnv = envSchema.parse(process.env);

export const env: Env = {
  ...parsedEnv,
  isCrossSiteDeployment: !parsedEnv.CORS_ORIGIN.startsWith("http://localhost"),
  isS3Configured: Boolean(
    parsedEnv.AWS_REGION && parsedEnv.AWS_S3_BUCKET && parsedEnv.AWS_ACCESS_KEY_ID && parsedEnv.AWS_SECRET_ACCESS_KEY,
  ),
};

export default env;
