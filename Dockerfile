# syntax=docker/dockerfile:1

# ---- build 스테이지: 의존성 설치 + Prisma Client 생성 + TypeScript 컴파일 ----
FROM node:20-alpine AS build
WORKDIR /app

# Alpine 기본 이미지에는 OpenSSL이 없어서 Prisma가 "libssl 버전을 못 찾음" 경고를
# 내며 아무 버전이나 추측해서 씀 — 실제 openssl을 깔아서 정확히 감지하게 함.
RUN apk add --no-cache openssl

# package.json/lock만 먼저 복사해서 소스 변경 시에도 npm ci 레이어가 캐시되게 함
COPY package.json package-lock.json ./
RUN npm ci

# Prisma는 스키마 파일 내용에 맞춰 클라이언트 코드를 생성하므로 스키마부터 복사
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime 스테이지: 실행에 필요한 산출물만 담은 최종 이미지 ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# 런타임에서 Prisma 쿼리 엔진이 OpenSSL을 정상적으로 찾도록 여기도 동일하게 설치
RUN apk add --no-cache openssl

# node_modules를 build 스테이지에서 그대로 가져옴 — devDependencies(prisma CLI 등)도
# 포함되는데, 컨테이너 시작 시 `prisma migrate deploy`를 실행하려면 prisma CLI가
# 필요하기 때문. 이미지 용량을 더 줄이고 싶으면 나중에 runtime 전용 설치로 분리 가능.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

EXPOSE 4000

# entrypoint에서 먼저 `prisma migrate deploy`를 실행한 뒤, 아래 CMD(node dist/server.js)로 넘어감
ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["node", "dist/server.js"]
