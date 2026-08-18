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

export type Env = z.infer<typeof envSchema>;

// TODO: 테스트에서 환경변수를 쉽게 스텁할 수 있도록, 이 값을 나중에 필요할 때
// 지연 평가(lazy)하는 방식으로 바꾸는 것도 고려해볼 것.
export const env: Env = envSchema.parse(process.env);

export default env;
