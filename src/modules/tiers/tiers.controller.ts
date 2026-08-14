import type { Request, Response, NextFunction } from "express"; // Express 컨트롤러 함수 시그니처에 필요한 타입
import * as tiersService from "./tiers.service"; // 실제 티어 조회/재계산 로직은 서비스 계층에 위임

// GET /groups/:id/tiers (?position=)
export async function listTiers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tiers = await tiersService.listTiers(Number(req.params.id), req.query as never);
    res.status(200).json({ tiers });
  } catch (err) {
    next(err);
  }
}

// POST /groups/:id/tiers/recalculate
export async function recalculateTiers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tiers = await tiersService.recalculateTiers(Number(req.params.id));
    res.status(200).json({ tiers });
  } catch (err) {
    next(err);
  }
}
