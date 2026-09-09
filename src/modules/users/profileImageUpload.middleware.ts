import path from "node:path"; // 저장 파일명을 안전하게 조합하기 위해 사용
import type { NextFunction, Request, Response } from "express"; // Express 미들웨어 시그니처 타입
import multer, { MulterError } from "multer"; // multipart/form-data 파일 업로드 처리
import { AppError } from "../../lib/AppError"; // 업로드 실패를 400으로 명확하게 표현하기 위해 사용
import { env } from "../../config/env"; // S3 설정 여부(isS3Configured)로 저장 방식을 고름
import { PROFILE_IMAGE_DIR } from "../../lib/storage/profileImageStorage"; // 로컬 디스크 저장 경로 (S3 미설정 시)

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// S3가 설정돼 있으면(env.isS3Configured) 파일을 메모리에만 올려서(diskStorage
// 없이) profileImageStorage.saveProfileImage가 file.buffer를 그대로 S3로 보냄.
// 아직 AWS 계정을 안 붙인 지금(2026-09-09)은 늘 diskStorage로 로컬에 저장됨 —
// 도커 컨테이너가 볼륨 없이 통째로 재생성되면 파일이 사라지는 그 방식 그대로.
const upload = multer({
  storage: env.isS3Configured
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, PROFILE_IMAGE_DIR),
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          // req.user는 authMiddleware가 이 미들웨어보다 먼저 실행돼서 이미 채워져 있음.
          const userId = req.user?.id ?? "unknown";
          cb(null, `${userId}-${Date.now()}${ext}`);
        },
      }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new AppError(400, "jpg, png, webp 형식의 이미지만 업로드할 수 있습니다."));
      return;
    }
    cb(null, true);
  },
}).single("file"); // 클라이언트가 보내는 form-data 필드명은 "file"

/**
 * multer 자체 에러(MulterError, 예: 용량 초과)와 fileFilter가 던진 AppError를
 * 둘 다 errorMiddleware가 이해할 수 있는 형태로 next()에 넘겨줌 — 이거 없이
 * upload를 라우트에 바로 꽂으면 용량 초과 같은 경우 400이 아니라 처리 안 된
 * 500으로 새버림.
 */
export function profileImageUpload(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      next(new AppError(400, `업로드 실패: ${err.message}`));
      return;
    }
    if (err) {
      next(err);
      return;
    }
    if (!req.file) {
      next(new AppError(400, "업로드할 파일(file)이 없습니다."));
      return;
    }
    next();
  });
}

export default profileImageUpload;
