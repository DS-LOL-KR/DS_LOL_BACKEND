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

  // 그냥 { err }로 넘기면 winston json 포맷이 Error의 message/stack을
  // (non-enumerable이라) 빼먹고 "{}"로 찍어버려서 디버깅이 불가능했음 —
  // 직접 꺼내서 남김.
  const errorInfo =
    err instanceof  Error
      ? { message: err.message, stack: err.stack, name: err.name }
      : { value: err };
  logger.error("Unhandled error", errorInfo);

  res.status(500).json({
    error: {
      message: "Internal Server Error",
    },
  });
}

export default errorMiddleware;
