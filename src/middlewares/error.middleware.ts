import type { NextFunction, Request, Response } from "express"; // Express 에러 핸들러 시그니처 타입
import { AppError } from "../lib/AppError"; // 우리가 의도적으로 던진 에러(상태코드 포함)인지 구분하기 위해 사용
import { logger } from "../lib/logger"; // 예상 못한(비AppError) 에러를 로그로 남기기 위해 사용

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        details: err.details ?? null,
      },
    });
    return;
  }

  logger.error("Unhandled error", { err });

  res.status(500).json({
    error: {
      message: "Internal Server Error",
    },
  });
}

export default errorMiddleware;
