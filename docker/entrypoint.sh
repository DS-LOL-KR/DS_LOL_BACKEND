#!/bin/sh
set -e

# 배포 환경 DB에 아직 적용 안 된 마이그레이션이 있으면 여기서 적용.
# 주의: prisma/migrations 폴더 자체가 아직 없으면 이 명령은 적용할 게 없어서
# 사실상 아무 일도 하지 않음 — 로컬에서 `npx prisma migrate dev --name init`을
# 한 번 돌려서 마이그레이션 파일을 생성하고 커밋해둬야 여기서 의미가 있음.
echo "[entrypoint] running prisma migrate deploy..."
npx prisma migrate deploy

echo "[entrypoint] starting app..."
exec "$@"
