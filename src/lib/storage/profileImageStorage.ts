import fs from "node:fs"; // 로컬 저장 방식일 때 이전 파일을 디스크에서 지우기 위해 사용
import path from "node:path"; // 저장 경로/S3 key를 조합하기 위해 사용
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"; // S3(또는 R2 등 S3 호환) 업로드/삭제
import { env } from "../../config/env"; // AWS_* 4개가 다 채워졌는지(isS3Configured)로 저장 방식을 고름

export const PROFILE_IMAGE_DIR = path.join(process.cwd(), "uploads", "profile-images");
fs.mkdirSync(PROFILE_IMAGE_DIR, { recursive: true });

// AWS 계정이 아직 연결 안 된 상태(2026-09-09)라 지금은 항상 null이고 로컬
// 디스크로만 저장됨 — AWS_REGION/AWS_S3_BUCKET/AWS_ACCESS_KEY_ID/
// AWS_SECRET_ACCESS_KEY를 .env에 채우면 별도 코드 변경 없이 바로 S3로 전환됨.
const s3Client = env.isS3Configured
  ? new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID as string,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY as string,
      },
    })
  : null;

const S3_KEY_PREFIX = "profile-images/";

function resolveS3PublicUrl(key: string): string {
  if (env.AWS_S3_PUBLIC_URL) return `${env.AWS_S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  return `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
}

function resolveS3KeyFromUrl(url: string): string | null {
  if (env.AWS_S3_PUBLIC_URL) {
    const base = `${env.AWS_S3_PUBLIC_URL.replace(/\/$/, "")}/`;
    if (url.startsWith(base)) return url.slice(base.length);
  }
  const defaultBase = `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/`;
  if (url.startsWith(defaultBase)) return url.slice(defaultBase.length);
  return null;
}

// isS3Configured가 false면 profileImageUpload.middleware.ts가 multer
// diskStorage를 써서 file.filename을 이미 채워둔 상태로 넘어옴(파일은 이미
// PROFILE_IMAGE_DIR에 저장 완료) — 여기서는 그 파일명을 URL로 바꿔주기만 함.
// isS3Configured가 true면 memoryStorage로 받은 file.buffer를 S3에 직접 올림.
export async function saveProfileImage(file: Express.Multer.File, userId: number): Promise<string> {
  if (s3Client) {
    const ext = path.extname(file.originalname).toLowerCase();
    const key = `${S3_KEY_PREFIX}${userId}-${Date.now()}${ext}`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    return resolveS3PublicUrl(key);
  }

  return `/uploads/profile-images/${file.filename}`;
}

// 이전 프로필 이미지를 지움 — url이 로컬 경로인지 S3 URL인지 보고 맞는 방식으로
// 삭제. 둘 다 아니면(예: 예전 구글 프로필 사진 URL) 조용히 무시.
export async function deleteProfileImage(url: string): Promise<void> {
  if (url.startsWith("/uploads/profile-images/")) {
    const oldPath = path.join(process.cwd(), url);
    fs.unlink(oldPath, () => {
      // 이미 지워졌거나 없는 파일이어도 상관없어서 에러는 무시.
    });
    return;
  }

  if (!s3Client) return;
  const key = resolveS3KeyFromUrl(url);
  if (!key) return;

  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key }));
  } catch {
    // 이전 이미지 삭제 실패는 지금 요청(새 이미지 업로드 자체)을 실패시킬 이유가
    // 아니라서 조용히 무시 — 버킷에 안 쓰는 파일이 좀 남는 정도의 비용.
  }
}
