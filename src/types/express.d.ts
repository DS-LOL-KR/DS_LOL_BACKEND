// ERD: users.id는 integer PK(increment) — Prisma User 모델과 동일하게 number로 통일.
export interface AuthenticatedUser {
  id: number;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
