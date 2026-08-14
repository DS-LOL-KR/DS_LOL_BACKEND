import type { NextFunction, Request, Response } from "express"; // Express 미들웨어 함수 시그니처에 필요한 타입
import type { ZodSchema } from "zod"; // 각 라우트가 넘겨주는 요청 바디 검증 스키마의 타입
import { AppError } from "../lib/AppError"; // 검증 실패를 400 에러로 통일해서 던지기 위해 사용

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(new AppError(400, "Validation failed", result.error.flatten()));
      return;
    }

    req.body = result.data;
    next();
  };
}

export default validate;
