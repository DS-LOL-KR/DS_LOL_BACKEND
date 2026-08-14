import { PrismaClient } from "@prisma/client"; // Prisma가 생성한 DB 클라이언트 — 모든 모듈의 서비스 계층이 이걸 통해 DB에 접근함

// 개발 중 hot-reload(tsx watch가 파일이 바뀔 때마다 모듈을 다시 실행함) 때문에
// PrismaClient 인스턴스가 여러 개 생성되는 것을 막기 위한 가드.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

export default prisma;
