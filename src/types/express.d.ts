// ERD: users.id는 integer PK(increment) — Prisma User 모델과 동일하게 number로 통일.
export interface AuthenticatedUser {
  id: number;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      // app.ts의 express.json({ verify })에서 채움 — 디스코드 인터랙션 서명 검증
      // (discord.controller.ts)은 JSON으로 파싱되기 전의 원본 바이트가 필요해서 둠.
      rawBody?: Buffer;
    }
  }
}

export {};
