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
});

export type Env = z.infer<typeof envSchema> & {
  // 프론트(Vercel)와 백엔드(ngrok)가 서로 다른 도메인으로 배포된 경우처럼, 쿠키
  // 관점에서 "cross-site"인 배포인지. localhost가 아니면 전부 cross-site로 취급 —
  // 이 경우 인증 쿠키는 SameSite=None + Secure가 아니면 브라우저가 fetch/XHR
  // 요청에 아예 안 실어 보내서 로그인 직후에도 계속 401이 남(실제로 이 문제로
  // 로그인→401→재로그인 무한 루프가 발생했었음, 2026-08-26 발견).
  isCrossSiteDeployment: boolean;
};

// TODO: 테스트에서 환경변수를 쉽게 스텁할 수 있도록, 이 값을 나중에 필요할 때
// 지연 평가(lazy)하는 방식으로 바꾸는 것도 고려해볼 것.
const parsedEnv = envSchema.parse(process.env);

export const env: Env = {
  ...parsedEnv,
  isCrossSiteDeployment: !parsedEnv.CORS_ORIGIN.startsWith("http://localhost"),
};

export default env;
