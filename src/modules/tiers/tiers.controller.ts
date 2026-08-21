import type { Request, Response, NextFunction } from "express"; // Express 컨트롤러 함수 시그니처에 필요한 타입
import * as tiersService from "./tiers.service"; // 실제 티어 조회/재계산 로직은 서비스 계층에 위임
import { AppError } from "../../lib/AppError"; // id가 숫자가 아니거나 쿼리 검증 실패 시 400을 명확하게 표현하기 위해 사용
import { listTiersQuerySchema } from "./tiers.schema"; // position 쿼리 검증용 스키마

function parseId(raw: string, next: NextFunction): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id)) {
    next(new AppError(400, "Invalid group id"));
    return null;
  }
  return id;
}

// GET /groups/:id/tiers (?position=)
export async function listTiers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const parsed = listTiersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new AppError(400, "Validation failed", parsed.error.flatten()));
      return;
    }

    const tiers = await tiersService.listTiers(id, parsed.data);
    res.status(200).json({ tiers });
  } catch (err) {
    next(err);
  }
}

// POST /groups/:id/tiers/recalculate
export async function recalculateTiers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const tiers = await tiersService.recalculateTiers(id);
    res.status(200).json({ tiers });
  } catch (err) {
    next(err);
  }
}
